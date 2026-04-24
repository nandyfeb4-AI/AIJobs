import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JobStatus } from "@prisma/client";
import OpenAI from "openai";

import type { AggregatedJob, ExternalJobSource, SourceBoardConfig } from "@aijobs/types";
import { splitCsv } from "@aijobs/config";
import { compareJobsByPostedAt, interleaveBoardJobs, isTargetRole, isUsRelevantJob } from "@aijobs/utils";

import { AshbyAdapter } from "./adapters/ashby.adapter";
import { GreenhouseAdapter } from "./adapters/greenhouse.adapter";
import { LeverAdapter } from "./adapters/lever.adapter";
import { getStarterBoardCatalog, getStarterBoards, getStarterBoardSummary } from "./board-catalog";
import { extractBoardsFromText } from "./board-discovery";
import { getCandidateSeedCompanies, getCandidateSeedGroups } from "./candidate-company-catalog";
import { formatBoardToken } from "./source-formatters";
import { getTargetCompanies } from "./target-company-catalog";
import type { AggregateJobsResult, SourceAdapter } from "./jobs.types";
import { PrismaService } from "../prisma/prisma.service";

type CandidateSourceTier = "top" | "priority" | "growth";
type CandidateBoardInput = {
  source: ExternalJobSource;
  boardToken: string;
  evidenceUrl: string;
};

const BOARD_FIRST_SOURCES: Array<Exclude<ExternalJobSource, "adzuna">> = [
  "greenhouse",
  "lever",
  "ashby",
];

const DEFAULT_CANDIDATE_FOCUS_AREAS = [
  "software engineering",
  "product",
  "design",
  "qa",
];

@Injectable()
export class JobsService {
  private readonly adapters: Record<ExternalJobSource, SourceAdapter>;
  private readonly openaiClient: OpenAI | null;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GreenhouseAdapter) greenhouseAdapter: GreenhouseAdapter,
    @Inject(LeverAdapter) leverAdapter: LeverAdapter,
    @Inject(AshbyAdapter) ashbyAdapter: AshbyAdapter,
  ) {
    this.adapters = {
      greenhouse: greenhouseAdapter,
      lever: leverAdapter,
      ashby: ashbyAdapter,
      adzuna: {
        source: "adzuna",
        async fetchJobs(): Promise<AggregatedJob[]> {
          throw new Error("Adzuna adapter is not configured yet");
        },
      },
    };

    const openAiApiKey = this.configService.get<string>("OPENAI_API_KEY");
    this.openaiClient = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
  }

  listConfiguredSources() {
    return {
      starter: getStarterBoardSummary(),
      configured: this.getConfiguredBoards(),
    };
  }

  listCandidateSeedGroups() {
    return getCandidateSeedGroups();
  }

  async bootstrapCandidateCompanies(groupId?: string) {
    const companies = getCandidateSeedCompanies(groupId).map((company) => ({
      ...company,
      confidence: company.tier === "top" ? 0.95 : company.tier === "priority" ? 0.88 : 0.78,
      sourceHint: undefined,
      notes: `Bootstrapped from ${company.origin}`,
    }));

    return this.upsertCandidateCompanies(companies);
  }

  async sourceCandidateCompanies(input?: {
    tier?: CandidateSourceTier;
    limit?: number;
    focusAreas?: string[];
    customQuery?: string;
  }) {
    if (!this.openaiClient) {
      throw new Error("OPENAI_API_KEY is required for automated candidate sourcing.");
    }

    const tier = input?.tier ?? "top";
    const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
    const focusAreas =
      input?.focusAreas && input.focusAreas.length > 0
        ? input.focusAreas
        : DEFAULT_CANDIDATE_FOCUS_AREAS;

    const response = await this.openaiClient.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      tools: [
        {
          type: "web_search",
          user_location: {
            type: "approximate",
            country: "US",
            timezone: "America/Denver",
          },
        },
      ],
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "Return JSON only.",
                "You source companies for a jobs platform.",
                "Find real companies that are likely to have hiring for these focus areas:",
                focusAreas.join(", "),
                "Prioritize companies that are likely to have public job boards and direct careers pages.",
                "Prefer well-known companies first for tier=top, then strong category leaders for tier=priority, then broader growth companies for tier=growth.",
                "Avoid duplicates, staffing firms, universities, government agencies, and companies with no clear corporate website.",
                "Include careersUrl only when you found a likely careers page from web results; otherwise return null.",
                "Use sourceHint only if the web evidence strongly suggests greenhouse, lever, or ashby; otherwise null.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: this.buildCandidateSourcingPrompt({
                tier,
                limit,
                focusAreas,
                customQuery: input?.customQuery,
              }),
            },
          ],
        },
      ],
    });

    const rawText = this.extractResponseText(response);
    const parsed = this.parseCandidateSourcingResponse(rawText);
    const candidateItems = this.extractCandidateSourcingItems(parsed);
    const normalizedCompanies = candidateItems
      .map((company) => this.normalizeSourcedCandidateCompany(company, tier, focusAreas))
      .filter((company): company is NonNullable<typeof company> => Boolean(company));
    const dedupedCompanies = await this.filterNewCandidateCompanies(normalizedCompanies);

    const imported = await this.upsertCandidateCompanies(dedupedCompanies);

    return {
      tier,
      requested: limit,
      sourced: dedupedCompanies.length,
      imported: imported.imported,
      llmAssistanceEnabled: true,
      companies: imported.companies,
      debug: {
        rawTextPreview: dedupedCompanies.length === 0 ? rawText.slice(0, 1200) : undefined,
        parsedCandidateCount: candidateItems.length,
        normalizedCandidateCount: normalizedCompanies.length,
        dedupedCandidateCount: dedupedCompanies.length,
        droppedCount: normalizedCompanies.length - dedupedCompanies.length,
      },
    };
  }

  async sourceCandidateBoards(input?: {
    limit?: number;
    focusAreas?: string[];
    customQuery?: string;
  }) {
    const limit = Math.min(Math.max(input?.limit ?? 25, 1), 200);
    const focusAreas =
      input?.focusAreas && input.focusAreas.length > 0
        ? input.focusAreas
        : DEFAULT_CANDIDATE_FOCUS_AREAS;

    const limitsBySource = this.distributeBoardSourceLimit(limit);
    const discoveredBySource = await this.harvestDirectBoardCandidates({
      limit,
      limitsBySource,
      focusAreas,
      customQuery: input?.customQuery,
    });

    const rawText = discoveredBySource
      .map(
        (entry) =>
          `# ${entry.source}\nqueries=${entry.queriesTried}\npages=${entry.pagesFetched}\ndiscovered=${entry.candidates.length}`,
      )
      .join("\n\n");
    const discoveredBoards = discoveredBySource.flatMap((entry) => entry.candidates);
    const { kept: dedupedCandidates, skipped: skippedDuplicateBoards } =
      await this.filterNewBoardCandidates(discoveredBoards);
    const validationPool = this.interleaveCandidateBoardGroups(
      BOARD_FIRST_SOURCES.map((source) =>
        dedupedCandidates.filter((candidate) => candidate.source === source),
      ),
      Math.min(Math.max(limit * 6, limit), dedupedCandidates.length),
    );
    const validatedBoards = await this.validateBoardCandidates(validationPool, limit);
    const createdBoardsBySource = validatedBoards.createdBoards.reduce<Record<
      Exclude<ExternalJobSource, "adzuna">,
      number
    >>((acc, board) => {
        const sourceName =
          typeof (board as { sourceName?: unknown }).sourceName === "string"
            ? ((board as { sourceName: Exclude<ExternalJobSource, "adzuna"> }).sourceName)
            : null;
        if (sourceName) {
          acc[sourceName] += 1;
        }
        return acc;
      },
      {
        greenhouse: 0,
        lever: 0,
        ashby: 0,
      },
    );
    const failedBoardsBySource = validatedBoards.failedValidations.reduce<Record<
      Exclude<ExternalJobSource, "adzuna">,
      number
    >>((acc, failure) => {
        const sourceName =
          failure.source === "greenhouse" || failure.source === "lever" || failure.source === "ashby"
            ? failure.source
            : null;
        if (sourceName) {
          acc[sourceName] += 1;
        }
        return acc;
      },
      {
        greenhouse: 0,
        lever: 0,
        ashby: 0,
      },
    );

    return {
      requested: limit,
      discovered: discoveredBoards.length,
      deduped: dedupedCandidates.length,
      validated: validatedBoards.createdBoards.length,
      skippedDuplicates: skippedDuplicateBoards.length,
      skippedDuplicateBoards: skippedDuplicateBoards.slice(0, 10),
      failedValidationCount: validatedBoards.failedValidations.length,
      failedValidations: validatedBoards.failedValidations,
      llmAssistanceEnabled: false,
      companies: validatedBoards.createdCompanies,
      boards: validatedBoards.createdBoards,
      sourceBreakdown: Object.fromEntries(
        discoveredBySource.map((entry) => [
          entry.source,
          {
            requested: limitsBySource[entry.source],
            discovered: entry.candidates.length,
            deduped: dedupedCandidates.filter((candidate) => candidate.source === entry.source).length,
            skipped: skippedDuplicateBoards.filter((candidate) => candidate.source === entry.source).length,
            validated: createdBoardsBySource[entry.source],
            failed: failedBoardsBySource[entry.source],
            pagesFetched: entry.pagesFetched,
            queriesTried: entry.queriesTried,
          },
        ]),
      ),
      debug: {
        rawTextPreview: rawText.slice(0, 1200),
        failedValidationCount: validatedBoards.failedValidations.length,
        failedValidations: validatedBoards.failedValidations.slice(0, 10),
        skippedDuplicateBoards: skippedDuplicateBoards.slice(0, 10),
        validationPoolSize: validationPool.length,
      },
    };
  }

  async upsertCandidateCompanies(
    companies: Array<{
      company: string;
      homepage: string;
      careersUrl?: string;
      companyDomain?: string;
      segments?: string[];
      sourceHint?: string;
      confidence?: number;
      origin?: string;
      notes?: string;
    }>,
  ) {
    const results = [];

    for (const company of companies) {
      const homepage = this.normalizeUrl(company.homepage);
      const careersUrl = company.careersUrl ? this.normalizeUrl(company.careersUrl) : null;
      const metadataUpdate = {
        careersUrl,
        companyDomain: company.companyDomain ?? this.domainFromUrl(homepage),
        segments: company.segments ?? [],
        sourceHint: company.sourceHint ?? null,
        confidence: company.confidence ?? null,
        origin: company.origin ?? "manual_import",
        notes: company.notes ?? null,
      };

      const existing = await (this.prisma as any).candidateCompany.findUnique({
        where: { company_homepage: { company: company.company, homepage } },
        select: { id: true, status: true },
      });

      let record;
      if (existing) {
        const resetableStatuses = ["candidate", "no_supported_board", "failed"];
        record = await (this.prisma as any).candidateCompany.update({
          where: { id: existing.id },
          data: {
            ...metadataUpdate,
            ...(resetableStatuses.includes(existing.status)
              ? { status: "candidate", lastDiscoveryError: null }
              : {}),
          },
        });
      } else {
        record = await (this.prisma as any).candidateCompany.create({
          data: {
            company: company.company,
            homepage,
            ...metadataUpdate,
          },
        });
      }

      results.push(record);
    }

    return {
      imported: results.length,
      companies: results,
    };
  }

  async enrichCandidateCompanies(limit = 25) {
    const candidates = await (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: ["candidate", "no_supported_board", "failed"],
        },
      },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });

    const results = [];

    for (const candidate of candidates) {
      const enrichment = await this.enrichCandidateCompany(candidate);

      const updated = await (this.prisma as any).candidateCompany.update({
        where: { id: candidate.id },
        data: {
          careersUrl: enrichment.careersUrl ?? candidate.careersUrl,
          companyDomain: enrichment.companyDomain ?? candidate.companyDomain,
          sourceHint: enrichment.sourceHint ?? null,
          segments:
            enrichment.segments && enrichment.segments.length > 0
              ? Array.from(new Set([...candidate.segments, ...enrichment.segments]))
              : candidate.segments,
          confidence: enrichment.confidence ?? candidate.confidence,
          notes: enrichment.notes ?? candidate.notes,
          lastDiscoveryError: enrichment.error ?? null,
        },
      });

      results.push({
        id: updated.id,
        company: updated.company,
        careersUrl: updated.careersUrl,
        sourceHint: updated.sourceHint,
        confidence: updated.confidence,
        enrichmentSource: enrichment.enrichmentSource,
        error: enrichment.error ?? null,
      });
    }

    return {
      processed: results.length,
      companies: results,
      llmAssistanceEnabled: Boolean(this.openaiClient),
    };
  }

  async listCandidateCompanies() {
    return (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: ["candidate", "discovering", "discovered", "no_supported_board"],
        },
      },
      include: {
        candidateBoards: {
          where: {
            status: {
              in: ["discovered", "validating", "validated"],
            },
          },
          orderBy: [{ updatedAt: "desc" }],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { company: "asc" }],
    });
  }

  async getCandidateDiscoveryTargets() {
    return (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: ["candidate", "no_supported_board", "failed"],
        },
      },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }, { company: "asc" }],
    });
  }

  async listCandidateBoards() {
    return (this.prisma as any).candidateBoard.findMany({
      where: {
        status: {
          in: ["discovered", "validating", "validated"],
        },
      },
      include: {
        candidateCompany: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async validateCandidateBoards() {
    const boards = await (this.prisma as any).candidateBoard.findMany({
      where: {
        status: "discovered",
      },
      include: {
        candidateCompany: true,
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const results = [];

    for (const board of boards) {
      const source = board.sourceName as ExternalJobSource;
      const adapter = this.adapters[source];
      const companyStatusUpdate =
        board.candidateCompany.status === "promoted" ? {} : { status: "discovered" };

      await (this.prisma as any).candidateBoard.update({
        where: { id: board.id },
        data: {
          status: "validating",
          validationError: null,
        },
      });

      try {
        const jobs = await adapter.fetchJobs(board.boardToken);
        const usJobs = jobs.filter((job) => isUsRelevantJob(job));

        if (!jobs.length) {
          await (this.prisma as any).candidateBoard.update({
            where: { id: board.id },
            data: {
              status: "rejected",
              validationError: "Board validated but returned no jobs.",
              validatedAt: new Date(),
            },
          });

          await (this.prisma as any).candidateCompany.update({
            where: { id: board.candidateCompanyId },
            data: {
              ...companyStatusUpdate,
              lastDiscoveredAt: new Date(),
              lastDiscoveryError: "Board validated but returned no jobs.",
            },
          });

          results.push({
            id: board.id,
            boardToken: board.boardToken,
            sourceName: board.sourceName,
            status: "rejected",
            reason: "no_jobs",
          });
          continue;
        }

        if (!usJobs.length) {
          await (this.prisma as any).candidateBoard.update({
            where: { id: board.id },
            data: {
              status: "rejected",
              validationError: "Board validated but returned no US jobs.",
              validatedAt: new Date(),
            },
          });

          await (this.prisma as any).candidateCompany.update({
            where: { id: board.candidateCompanyId },
            data: {
              ...companyStatusUpdate,
              lastDiscoveredAt: new Date(),
              lastDiscoveryError: "Board validated but returned no US jobs.",
            },
          });

          results.push({
            id: board.id,
            boardToken: board.boardToken,
            sourceName: board.sourceName,
            status: "rejected",
            reason: "no_us_jobs",
          });
          continue;
        }

        await (this.prisma as any).candidateBoard.update({
          where: { id: board.id },
          data: {
            status: "validated",
            validationError: null,
            validatedAt: new Date(),
          },
        });

        await (this.prisma as any).candidateCompany.update({
          where: { id: board.candidateCompanyId },
          data: {
            ...companyStatusUpdate,
            lastDiscoveredAt: new Date(),
            lastDiscoveryError: null,
          },
        });

        results.push({
          id: board.id,
          boardToken: board.boardToken,
          sourceName: board.sourceName,
          status: "validated",
          jobs: usJobs.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown validation error";

        await (this.prisma as any).candidateBoard.update({
          where: { id: board.id },
          data: {
            status: "rejected",
            validationError: message,
            validatedAt: new Date(),
          },
        });

        await (this.prisma as any).candidateCompany.update({
          where: { id: board.candidateCompanyId },
          data: {
            ...companyStatusUpdate,
            lastDiscoveredAt: new Date(),
            lastDiscoveryError: message,
          },
        });

        results.push({
          id: board.id,
          boardToken: board.boardToken,
          sourceName: board.sourceName,
          status: "rejected",
          reason: message,
        });
      }
    }

    return {
      processed: results.length,
      results,
    };
  }

  async promoteValidatedCandidateBoards() {
    const boards = await (this.prisma as any).candidateBoard.findMany({
      where: {
        status: "validated",
      },
      include: {
        candidateCompany: true,
      },
      orderBy: [{ updatedAt: "asc" }],
    });

    const promoted = [];

    for (const board of boards) {
      const existingBoard = await (this.prisma as any).sourceBoard.findUnique({
        where: {
          sourceName_boardToken: {
            sourceName: board.sourceName,
            boardToken: board.boardToken,
          },
        },
      });

      const targetBoard = existingBoard
        ? await (this.prisma as any).sourceBoard.update({
            where: { id: existingBoard.id },
            data: {
              company: board.candidateCompany.company,
              companyDomain: board.candidateCompany.companyDomain ?? this.domainFromUrl(board.candidateCompany.homepage),
              active: true,
            },
          })
        : await (this.prisma as any).sourceBoard.create({
            data: {
              sourceName: board.sourceName,
              boardToken: board.boardToken,
              company: board.candidateCompany.company,
              companyDomain:
                board.candidateCompany.companyDomain ?? this.domainFromUrl(board.candidateCompany.homepage),
              tier: null,
              status: "unverified",
              active: true,
            },
          });

      await (this.prisma as any).candidateBoard.update({
        where: { id: board.id },
        data: {
          status: "promoted",
          promotedAt: new Date(),
          promotedBoardId: targetBoard.id,
        },
      });

      await (this.prisma as any).candidateCompany.update({
        where: { id: board.candidateCompanyId },
        data: {
          status: "promoted",
        },
      });

      promoted.push({
        candidateBoardId: board.id,
        sourceBoardId: targetBoard.id,
        company: board.candidateCompany.company,
        sourceName: board.sourceName,
        boardToken: board.boardToken,
      });
    }

    return {
      promoted: promoted.length,
      boards: promoted,
    };
  }

  async getDiscoveryTargets() {
    const trackedBoards = await (this.prisma as any).sourceBoard.findMany({
      select: {
        company: true,
      },
    });

    const trackedCompanies = new Set(
      trackedBoards.map((board: { company: string }) => board.company.trim().toLowerCase()),
    );

    return getTargetCompanies().filter(
      (company) => !trackedCompanies.has(company.company.trim().toLowerCase()),
    );
  }

  async getBoardsByStatus(status: "unverified" | "working" | "empty" | "failed", source?: ExternalJobSource) {
    const rows = await (this.prisma as any).sourceBoard.findMany({
      where: {
        active: true,
        status,
        ...(source ? { sourceName: source } : {}),
      },
      select: {
        sourceName: true,
        boardToken: true,
      },
      orderBy: [{ sourceName: "asc" }, { boardToken: "asc" }],
    });

    return rows.map((row: { sourceName: ExternalJobSource; boardToken: string }) => ({
      source: row.sourceName,
      boardToken: row.boardToken,
    }));
  }

  async aggregateJobs(source?: ExternalJobSource, limit = 50): Promise<AggregateJobsResult> {
    const result = await this.fetchSourceJobs(source);

    return {
      jobs: interleaveBoardJobs(result.boardJobs, limit),
      errors: result.errors,
      requestedSources: result.requestedSources,
    };
  }

  async ingestBoard(source: ExternalJobSource, boardToken: string) {
    const adapter = this.adapters[source];
    const fetchedJobs = await adapter.fetchJobs(boardToken);
    const usJobs = fetchedJobs.filter((job) => isUsRelevantJob(job));
    const jobs = usJobs
      .filter((job) => isTargetRole(job))
      .sort((left, right) => compareJobsByPostedAt(right, left));
    const existingBoard = await (this.prisma as any).sourceBoard.findUnique({
      where: {
        sourceName_boardToken: {
          sourceName: source,
          boardToken,
        },
      },
      select: {
        companyDomain: true,
      },
    });
    const boardDomain = existingBoard?.companyDomain ?? null;

    const seenSourceKeys: string[] = [];
    let persisted = 0;

    for (const job of jobs) {
      seenSourceKeys.push(job.id);
      const resolvedDomain =
        this.companyDomain(job.companyLogoUrl) ??
        boardDomain ??
        this.targetCompanyDomain(job.company) ??
        this.publicCompanyDomainFromUrl(job.applyUrl) ??
        null;
      const resolvedLogoUrl = job.companyLogoUrl ?? this.logoUrlForDomain(resolvedDomain);

      await this.prisma.job.upsert({
        where: { sourceKey: job.id },
        create: {
          sourceKey: job.id,
          sourceId: job.id,
          sourceName: job.source,
          boardToken: job.boardToken,
          title: job.title,
          company: job.company,
          companyDomain: resolvedDomain,
          companyLogoUrl: resolvedLogoUrl,
          location: job.location,
          employmentType: job.employmentType,
          remoteType: job.workMode,
          description: job.description ?? "",
          applyUrl: job.applyUrl,
          postedAt: this.toDate(job.postedAt),
          sourceUpdatedAt: this.toDate(job.postedAt),
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
          contentHash: this.contentHash(job),
          status: JobStatus.active,
        },
        update: {
          title: job.title,
          company: job.company,
          companyDomain: resolvedDomain,
          companyLogoUrl: resolvedLogoUrl,
          location: job.location,
          employmentType: job.employmentType,
          remoteType: job.workMode,
          description: job.description ?? "",
          applyUrl: job.applyUrl,
          postedAt: this.toDate(job.postedAt),
          sourceUpdatedAt: this.toDate(job.postedAt),
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
          contentHash: this.contentHash(job),
          status: JobStatus.active,
          syncCount: { increment: 1 },
        },
      });
      persisted += 1;
    }

    await this.prisma.job.updateMany({
      where: {
        sourceName: source,
        boardToken,
        status: JobStatus.active,
        sourceKey: { notIn: seenSourceKeys.length ? seenSourceKeys : ["__none__"] },
      },
      data: {
        status: JobStatus.stale,
        lastSyncedAt: new Date(),
      },
    });

    return {
      source,
      boardToken,
      persisted,
    };
  }

  async getPersistedJobs(input?: { cursor?: string; limit?: number }) {
    const pageSize =
      typeof input?.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
        ? Math.min(input.limit, 100)
        : 24;
    const cursor = this.decodeFeedCursor(input?.cursor);
    const [jobs, boardRows] = await Promise.all([
      this.prisma.job.findMany({
        where: {
          status: JobStatus.active,
          ...(cursor
            ? {
                OR: [
                  { updatedAt: { lt: cursor.updatedAt } },
                  {
                    AND: [
                      { updatedAt: cursor.updatedAt },
                      { sourceKey: { lt: cursor.sourceKey } },
                    ],
                  },
                ],
              }
            : {}),
        },
        select: {
          sourceKey: true,
          sourceName: true,
          boardToken: true,
          title: true,
          company: true,
          companyDomain: true,
          companyLogoUrl: true,
          location: true,
          employmentType: true,
          remoteType: true,
          description: true,
          applyUrl: true,
          postedAt: true,
          updatedAt: true,
        },
        orderBy: [
          { updatedAt: "desc" },
          { sourceKey: "desc" },
        ],
        take: pageSize + 1,
      }),
      (this.prisma as any).sourceBoard.findMany({
        select: {
          sourceName: true,
          boardToken: true,
          companyDomain: true,
        },
      }),
    ]);

    const boardDomains = new Map<string, string | null>(
      boardRows.map((row: { sourceName: string; boardToken: string; companyDomain: string | null }) => [
        `${row.sourceName}:${row.boardToken}`,
        row.companyDomain,
      ]),
    );

    const hasMore = jobs.length > pageSize;
    const pageJobs = hasMore ? jobs.slice(0, pageSize) : jobs;

    const requestedSources = this.getConfiguredBoards();

    return {
      jobs: this.mapPersistedJobs(pageJobs, boardDomains),
      nextCursor: hasMore ? this.encodeFeedCursor(pageJobs[pageJobs.length - 1]) : null,
      hasMore,
      requestedSources,
      errors: [],
    };
  }

  async getBoardHealth(source?: ExternalJobSource) {
    const [persistedBoards, seededBoards] = await Promise.all([
      (this.prisma as any).sourceBoard.findMany({
        where: {
          active: true,
          ...(source ? { sourceName: source } : {}),
        },
        orderBy: [
          { status: "asc" },
          { lastTargetJobCount: "desc" },
          { updatedAt: "desc" },
        ],
      }),
      Promise.resolve(getStarterBoardCatalog(source)),
    ]);

    const persistedByKey = new Map<string, any>(
      persistedBoards.map((board: any) => [`${board.sourceName}:${board.boardToken}`, board]),
    );

    const merged = seededBoards.map((board) => {
      const key = `${board.source}:${board.boardToken}`;
      const persisted = persistedByKey.get(key);

      if (persisted) {
        return persisted;
      }

      return {
        id: `seed:${key}`,
        sourceName: board.source,
        boardToken: board.boardToken,
        company: board.company,
        companyDomain: board.domain,
        tier: board.tier,
        status: "unverified",
        active: true,
        lastCheckedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        lastSeenJobCount: 0,
        lastTargetJobCount: 0,
        totalPersistedJobs: 0,
        createdAt: null,
        updatedAt: null,
      };
    });

    const extras = persistedBoards.filter((board: any) => {
      const key = `${board.sourceName}:${board.boardToken}`;
      return !seededBoards.some(
        (seed) => seed.source === board.sourceName && seed.boardToken === board.boardToken,
      );
    });

    return [...merged, ...extras].sort((left, right) => {
      if (left.sourceName !== right.sourceName) {
        return left.sourceName.localeCompare(right.sourceName);
      }

      const targetDiff = (right.lastTargetJobCount ?? 0) - (left.lastTargetJobCount ?? 0);
      if (targetDiff !== 0) {
        return targetDiff;
      }

      return left.company.localeCompare(right.company);
    });
  }

  async markCandidateCompanyDiscoveryStarted(candidateCompanyId: string) {
    await (this.prisma as any).candidateCompany.update({
      where: { id: candidateCompanyId },
      data: {
        status: "discovering",
        lastDiscoveryError: null,
      },
    });
  }

  async markCandidateCompanyDiscoveryResult(input: {
    candidateCompanyId: string;
    discoveredBoards: Array<{ source: string; boardToken: string; evidenceUrl?: string }>;
    errors: Array<{ url: string; message: string }>;
  }) {
    for (const board of input.discoveredBoards) {
      await (this.prisma as any).candidateBoard.upsert({
        where: {
          sourceName_boardToken_candidateCompanyId: {
            sourceName: board.source,
            boardToken: board.boardToken,
            candidateCompanyId: input.candidateCompanyId,
          },
        },
        create: {
          candidateCompanyId: input.candidateCompanyId,
          sourceName: board.source,
          boardToken: board.boardToken,
          evidenceUrl: board.evidenceUrl ?? null,
          status: "discovered",
        },
        update: {
          evidenceUrl: board.evidenceUrl ?? null,
          status: "discovered",
          validationError: null,
        },
      });
    }

    await (this.prisma as any).candidateCompany.update({
      where: { id: input.candidateCompanyId },
      data: {
        status: input.discoveredBoards.length > 0 ? "discovered" : "no_supported_board",
        lastDiscoveredAt: new Date(),
        lastDiscoveryError:
          input.discoveredBoards.length === 0 && input.errors.length > 0
            ? input.errors.map((error) => `${error.url}: ${error.message}`).slice(0, 3).join(" | ")
            : null,
      },
    });
  }

  private getConfiguredBoards(filterSource?: ExternalJobSource): SourceBoardConfig[] {
    const greenhouse = splitCsv(this.configService.get<string>("GREENHOUSE_BOARD_TOKENS")).map((boardToken) => ({
      source: "greenhouse" as const,
      boardToken,
    }));

    const lever = splitCsv(this.configService.get<string>("LEVER_COMPANY_HANDLES")).map((boardToken) => ({
      source: "lever" as const,
      boardToken,
    }));

    const ashby = splitCsv(this.configService.get<string>("ASHBY_JOB_BOARD_NAMES")).map((boardToken) => ({
      source: "ashby" as const,
      boardToken,
    }));

    const seeded = getStarterBoards(filterSource);
    const envBoards = [...greenhouse, ...lever, ...ashby];
    const all = [...seeded, ...envBoards]
      .filter((item) => (filterSource ? item.source === filterSource : true))
      .filter(
        (item, index, array) =>
          array.findIndex(
            (candidate) =>
              candidate.source === item.source && candidate.boardToken === item.boardToken,
          ) === index,
      );

    return filterSource ? all.filter((item) => item.source === filterSource) : all;
  }

  private async fetchSourceJobs(source?: ExternalJobSource) {
    const requestedSources = this.getConfiguredBoards(source);
    const settled = await Promise.allSettled(
      requestedSources.map(async (item) => {
        const adapter = this.adapters[item.source];
        const filtered = (await adapter.fetchJobs(item.boardToken))
          .filter((job) => isTargetRole(job) && isUsRelevantJob(job))
          .sort((left, right) => compareJobsByPostedAt(right, left));

        return {
          source: item.source,
          boardToken: item.boardToken,
          jobs: filtered,
        };
      }),
    );

    const boardJobs: AggregatedJob[][] = [];
    const boardResults: Array<{ source: ExternalJobSource; boardToken: string; jobs: AggregatedJob[] }> = [];
    const errors: AggregateJobsResult["errors"] = [];

    settled.forEach((result, index) => {
      const item = requestedSources[index];
      if (!item) return;

      if (result.status === "fulfilled") {
        boardResults.push(result.value);
        if (result.value.jobs.length) {
          boardJobs.push(result.value.jobs);
        }
      } else {
        errors.push({
          source: item.source,
          boardToken: item.boardToken,
          message: result.reason instanceof Error ? result.reason.message : "Unknown fetch error",
        });
      }
    });

    return { boardJobs, boardResults, errors, requestedSources };
  }

  private toDate(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private contentHash(job: AggregatedJob) {
    return [
      job.title,
      job.company,
      job.location,
      job.employmentType,
      job.workMode,
      job.salary,
      job.description,
    ]
      .filter(Boolean)
      .join("|");
  }

  private companyDomain(logoUrl?: string | null) {
    if (!logoUrl) return null;

    try {
      const url = new URL(logoUrl);
      return url.searchParams.get("domain_url");
    } catch {
      return null;
    }
  }

  private logoUrlForDomain(domain?: string | null) {
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(domain)}`;
  }

  private normalizeUrl(url: string) {
    return url.trim().replace(/\/$/, "");
  }

  private domainFromUrl(url?: string | null) {
    if (!url) return null;

    try {
      return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return null;
    }
  }

  private async enrichCandidateCompany(candidate: {
    company: string;
    homepage: string;
    careersUrl: string | null;
    companyDomain: string | null;
    segments: string[];
  }) {
    const urlsToTry = Array.from(
      new Set(
        [
          candidate.careersUrl,
          candidate.homepage,
          `${candidate.homepage.replace(/\/$/, "")}/careers`,
          `${candidate.homepage.replace(/\/$/, "")}/jobs`,
          `${candidate.homepage.replace(/\/$/, "")}/company/careers`,
        ].filter(Boolean) as string[],
      ),
    );

    let careersUrl = candidate.careersUrl;
    let sourceHint: string | null = null;
    let companyDomain = candidate.companyDomain ?? this.domainFromUrl(candidate.homepage);
    const scrapedSignals: Array<{ url: string; html: string }> = [];
    const errors: string[] = [];

    for (const url of urlsToTry) {
      try {
        const page = await this.fetchPage(url);
        scrapedSignals.push(page);

        const boards = extractBoardsFromText(`${page.url}\n${page.html}`, page.url);
        if (boards.length > 0) {
          careersUrl = boards[0]?.evidenceUrl ?? page.url;
          sourceHint = boards[0]?.source ?? sourceHint;
        }

        const linkedCareersUrl = this.findLikelyCareersUrl(page.html, page.url);
        if (!careersUrl && linkedCareersUrl) {
          careersUrl = linkedCareersUrl;
        }

        if (careersUrl && sourceHint) {
          break;
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown enrichment error");
      }
    }

    if (this.openaiClient) {
      const llmResult = await this.runLlmCompanyEnrichment({
        company: candidate.company,
        homepage: candidate.homepage,
        careersUrl,
        sourceHint,
        segments: candidate.segments,
        pages: scrapedSignals.slice(0, 2),
      });

      careersUrl = llmResult.careersUrl ?? careersUrl;
      sourceHint = llmResult.sourceHint ?? sourceHint;
      companyDomain = llmResult.companyDomain ?? companyDomain;

      return {
        careersUrl,
        sourceHint,
        companyDomain,
        segments: llmResult.segments ?? [],
        confidence: llmResult.confidence ?? null,
        notes: llmResult.notes ?? null,
        enrichmentSource: "scrape+llm",
        error: errors.length ? errors.join(" | ") : null,
      };
    }

    return {
      careersUrl,
      sourceHint,
      companyDomain,
      segments: [],
      confidence: sourceHint ? 0.78 : null,
      notes: sourceHint ? "ATS source inferred from scraping." : null,
      enrichmentSource: "scrape-only",
      error: errors.length ? errors.join(" | ") : null,
    };
  }

  private async fetchPage(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; AIJobsCandidateBot/0.1; +https://aijobs.local/candidates)",
        },
      });

      if (!response.ok) {
        throw new Error(`Page request failed with ${response.status}`);
      }

      return {
        url: response.url,
        html: await response.text(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private findLikelyCareersUrl(html: string, baseUrl: string) {
    const matches = Array.from(
      html.matchAll(/href=["']([^"']*(?:careers|jobs)[^"']*)["']/gi),
    );

    for (const match of matches) {
      const href = match[1];
      if (!href) continue;

      try {
        return new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }

    return null;
  }

  private async runLlmCompanyEnrichment(input: {
    company: string;
    homepage: string;
    careersUrl: string | null;
    sourceHint: string | null;
    segments: string[];
    pages: Array<{ url: string; html: string }>;
  }) {
    if (!this.openaiClient) {
      return {};
    }

    const pageSummary = input.pages
      .map((page) => `URL: ${page.url}\nHTML Snippet:\n${page.html.replace(/\s+/g, " ").slice(0, 3000)}`)
      .join("\n\n");

    try {
      const response = await this.openaiClient.responses.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        input: [
          {
            role: "system",
            content:
              "You extract company sourcing metadata for ATS discovery. Return JSON only.",
          },
          {
            role: "user",
            content: `Company: ${input.company}
Homepage: ${input.homepage}
Existing careersUrl: ${input.careersUrl ?? "unknown"}
Existing sourceHint: ${input.sourceHint ?? "unknown"}
Existing segments: ${input.segments.join(", ") || "unknown"}

Pages:
${pageSummary}

Return strict JSON:
{
  "careersUrl": string | null,
  "companyDomain": string | null,
  "sourceHint": "greenhouse" | "lever" | "ashby" | null,
  "segments": string[],
  "confidence": number | null,
  "notes": string | null
}`,
          },
        ],
      });

      const text = (response as any).output_text ?? "";
      if (!text) return {};

      const parsed = JSON.parse(text);
      return {
        careersUrl: parsed.careersUrl ?? null,
        companyDomain: parsed.companyDomain ?? null,
        sourceHint: parsed.sourceHint ?? null,
        segments: Array.isArray(parsed.segments) ? parsed.segments : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
        notes: parsed.notes ?? null,
      };
    } catch {
      return {};
    }
  }

  private buildBoardSourcingPrompt(input: {
    source: Exclude<ExternalJobSource, "adzuna">;
    limit: number;
    focusAreas: string[];
    customQuery?: string;
  }) {
    const sourceQueryGuidance: Record<Exclude<ExternalJobSource, "adzuna">, string[]> = {
      greenhouse: [
        'Search for direct Greenhouse board roots, using evidence like site:boards.greenhouse.io or site:job-boards.greenhouse.io.',
        "Ignore company homepages and ignore Greenhouse job detail URLs if the board root is not visible.",
      ],
      lever: [
        'Search for direct Lever board roots using evidence like site:jobs.lever.co.',
        "Ignore company pages unless the actual jobs.lever.co URL is visible in the result source.",
      ],
      ashby: [
        'Search for direct Ashby board roots using evidence like site:jobs.ashbyhq.com.',
        "Be conservative with Ashby: only include URLs that appear directly in search source URLs, not guessed slugs.",
      ],
    };

    const sourcePatterns: Record<Exclude<ExternalJobSource, "adzuna">, string> = {
      greenhouse: "https://boards.greenhouse.io/<token> or https://job-boards.greenhouse.io/<token>",
      lever: "https://jobs.lever.co/<token>",
      ashby: "https://jobs.ashbyhq.com/<token>",
    };

    return [
      `Find up to ${input.limit} public hosted ${input.source} ATS board URLs.`,
      `Target role families: ${input.focusAreas.join(", ")}.`,
      "Prioritize startups, growth-stage SaaS, AI, devtools, fintech, and product-led software companies.",
      `Only include direct ATS-hosted board URLs for ${input.source}.`,
      `Valid pattern: ${sourcePatterns[input.source]}.`,
      ...sourceQueryGuidance[input.source],
      "Return one URL per line, no markdown table, no explanation.",
      input.customQuery ? `Extra guidance: ${input.customQuery}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildCandidateSourcingPrompt(input: {
    tier: CandidateSourceTier;
    limit: number;
    focusAreas: string[];
    customQuery?: string;
  }) {
    const tierGuidance = {
      top: "Focus on FAANG-plus, globally recognized technology companies, and category-defining employers.",
      priority: "Focus on strong AI, cloud, developer tools, fintech, productivity, and enterprise software companies.",
      growth: "Focus on broader high-signal growth-stage and mid-market technology companies with strong product teams.",
    } satisfies Record<CandidateSourceTier, string>;

    return [
      `Source ${input.limit} unique companies for tier "${input.tier}".`,
      tierGuidance[input.tier],
      `Focus role families: ${input.focusAreas.join(", ")}.`,
      "Use web search to find current companies and likely official homepages/careers pages.",
      "Return strict JSON in this shape:",
      JSON.stringify(
        {
          companies: [
            {
              company: "Example Company",
              homepage: "https://example.com",
              careersUrl: "https://example.com/careers",
              companyDomain: "example.com",
              segments: ["ai", "software engineering", "product"],
              sourceHint: "greenhouse",
              confidence: 0.86,
              notes: "Short explanation for why this company fits.",
            },
          ],
        },
        null,
        2,
      ),
      input.customQuery ? `Extra sourcing guidance: ${input.customQuery}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private parseCandidateSourcingResponse(text: string): {
    companies?: Array<{
      company?: string;
      homepage?: string;
      careersUrl?: string | null;
      companyDomain?: string | null;
      segments?: string[];
      sourceHint?: string | null;
      confidence?: number | null;
      notes?: string | null;
    }>;
  } {
    if (!text.trim()) {
      return {};
    }

    try {
      return JSON.parse(this.stripJsonFences(text));
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(this.stripJsonFences(text.slice(start, end + 1)));
        } catch {
          const arrayStart = text.indexOf("[");
          const arrayEnd = text.lastIndexOf("]");
          if (arrayStart >= 0 && arrayEnd > arrayStart) {
            try {
              const items = JSON.parse(this.stripJsonFences(text.slice(arrayStart, arrayEnd + 1)));
              return { companies: Array.isArray(items) ? items : [] };
            } catch {
              return {};
            }
          }

          return {};
        }
      }

      return {};
    }
  }

  private distributeBoardSourceLimit(limit: number) {
    const perSource = Math.floor(limit / BOARD_FIRST_SOURCES.length);
    let remainder = limit % BOARD_FIRST_SOURCES.length;

    return BOARD_FIRST_SOURCES.reduce(
      (acc, source) => {
        acc[source] = perSource + (remainder > 0 ? 1 : 0);
        if (remainder > 0) {
          remainder -= 1;
        }
        return acc;
      },
      {} as Record<Exclude<ExternalJobSource, "adzuna">, number>,
    );
  }

  private buildBoardSearchQueries(input: {
    source: Exclude<ExternalJobSource, "adzuna">;
    focusAreas: string[];
    customQuery?: string;
  }) {
    const hostsBySource: Record<Exclude<ExternalJobSource, "adzuna">, string[]> = {
      greenhouse: ["boards.greenhouse.io", "job-boards.greenhouse.io"],
      lever: ["jobs.lever.co"],
      ashby: ["jobs.ashbyhq.com"],
    };

    const focusTermsByArea: Record<string, string[]> = {
      "software engineering": ["software engineer", "backend engineer", "frontend engineer"],
      product: ["product manager", "technical product manager"],
      design: ["product designer", "ux designer"],
      qa: ["qa engineer", "sdet"],
    };

    const focusTerms = Array.from(
      new Set(
        input.focusAreas.flatMap((area) => focusTermsByArea[area.toLowerCase()] ?? [area.toLowerCase()]),
      ),
    ).slice(0, 6);

    const roleClause = focusTerms.map((term) => `"${term}"`).join(" OR ");
    const usClause = '"United States" OR "Remote US" OR "Remote, US" OR USA OR "New York" OR "San Francisco"';

    return hostsBySource[input.source].flatMap((host) => {
      const queries = [
        `site:${host} (${roleClause}) (${usClause})`,
        `site:${host} jobs (${roleClause})`,
        `site:${host} careers (${roleClause}) (${usClause})`,
        `site:${host} ${input.source} board`,
      ];

      if (input.customQuery?.trim()) {
        queries.push(`site:${host} ${input.customQuery.trim()}`);
      }

      return queries;
    });
  }

  private async harvestDirectBoardCandidates(input: {
    limit: number;
    limitsBySource: Record<Exclude<ExternalJobSource, "adzuna">, number>;
    focusAreas: string[];
    customQuery?: string;
  }) {
    const maxPagesPerQuery = 5;

    return Promise.all(
      BOARD_FIRST_SOURCES.map(async (source) => {
        const requested = input.limitsBySource[source];
        const targetCandidates = Math.min(Math.max(requested * 8, 20), 240);
        const queries = this.buildBoardSearchQueries({
          source,
          focusAreas: input.focusAreas,
          customQuery: input.customQuery,
        });
        const seenKeys = new Set<string>();
        const candidates: CandidateBoardInput[] = [];
        let queriesTried = 0;
        let pagesFetched = 0;
        let directSearchBlocked = false;

        for (const query of queries) {
          queriesTried += 1;

          for (let pageIndex = 0; pageIndex < maxPagesPerQuery; pageIndex += 1) {
            const offset = pageIndex * 30;
            let html = "";

            try {
              html = await this.runBoardSourceSearch({
                source,
                query,
                offset,
                focusAreas: input.focusAreas,
              });
            } catch {
              break;
            }

            pagesFetched += 1;

            if (this.isSearchAnomalyPage(html)) {
              directSearchBlocked = true;
              break;
            }

            const pageCandidates = this.extractBoardCandidatesFromSearchResponse(html, source);
            let addedFromPage = 0;

            for (const candidate of pageCandidates) {
              const key = `${candidate.source}:${candidate.boardToken}`;
              if (seenKeys.has(key)) {
                continue;
              }

              seenKeys.add(key);
              candidates.push(candidate);
              addedFromPage += 1;

              if (candidates.length >= targetCandidates) {
                break;
              }
            }

            if (candidates.length >= targetCandidates || addedFromPage === 0) {
              break;
            }
          }

          if (candidates.length >= targetCandidates || directSearchBlocked) {
            break;
          }
        }

        if (this.openaiClient && candidates.length < Math.min(requested, 10)) {
          const fallbackQueries = queries.slice(0, Math.min(queries.length, 4));

          for (const query of fallbackQueries) {
            queriesTried += 1;

            const sourceUrls = await this.runBoardSourceSearchWithOpenAi({
              source,
              query,
              focusAreas: input.focusAreas,
            });
            const pageCandidates = this.extractBoardCandidatesFromSourceUrls(sourceUrls, source)
              .map((board) =>
                this.normalizeBoardCandidate({
                  source: board.source,
                  boardToken: board.boardToken,
                  evidenceUrl: board.evidenceUrl,
                }),
              )
              .filter((candidate): candidate is CandidateBoardInput => Boolean(candidate));

            for (const candidate of pageCandidates) {
              const key = `${candidate.source}:${candidate.boardToken}`;
              if (seenKeys.has(key)) {
                continue;
              }

              seenKeys.add(key);
              candidates.push(candidate);

              if (candidates.length >= targetCandidates) {
                break;
              }
            }

            if (candidates.length >= targetCandidates) {
              break;
            }
          }
        }

        return {
          source,
          candidates,
          queriesTried,
          pagesFetched,
        };
      }),
    );
  }

  private interleaveCandidateBoardGroups(groups: CandidateBoardInput[][], limit: number) {
    const queues = groups.map((group) => [...group]);
    const selected: CandidateBoardInput[] = [];

    while (selected.length < limit) {
      let addedInRound = false;

      for (const queue of queues) {
        const next = queue.shift();
        if (!next) continue;

        selected.push(next);
        addedInRound = true;

        if (selected.length >= limit) {
          break;
        }
      }

      if (!addedInRound) {
        break;
      }
    }

    return selected;
  }

  private async runBoardSourceSearch(input: {
    source: Exclude<ExternalJobSource, "adzuna">;
    query: string;
    offset: number;
    focusAreas: string[];
  }) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}&s=${input.offset}`;
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; AIJobsBoardHarvester/0.1; +https://aijobs.local/harvest)",
      },
    });

    if (!response.ok) {
      throw new Error(`Search request failed with ${response.status}`);
    }

    return response.text();
  }

  private async runBoardSourceSearchWithOpenAi(input: {
    source: Exclude<ExternalJobSource, "adzuna">;
    query: string;
    focusAreas: string[];
  }) {
    if (!this.openaiClient) {
      return [];
    }

    try {
      const response = await this.openaiClient.responses.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        tools: [
          {
            type: "web_search",
            user_location: {
              type: "approximate",
              country: "US",
              timezone: "America/Denver",
            },
          },
        ],
        include: ["web_search_call.action.sources"],
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "Find public hosted ATS job posting URLs only.",
                  `Target ATS source: ${input.source}.`,
                  "Prioritize companies hiring in the United States or remote US.",
                  "Prefer direct job posting URLs or apply URLs on the requested ATS host.",
                ].join(" "),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${input.query}. Focus areas: ${input.focusAreas.join(", ")}.`,
              },
            ],
          },
        ],
      });

      return this.extractWebSearchSourceUrls(response);
    } catch {
      return [];
    }
  }

  private extractCandidateSourcingItems(parsed: unknown) {
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    const record = parsed as Record<string, unknown>;
    const candidates =
      (Array.isArray(record.companies) ? record.companies : null) ??
      (Array.isArray(record.results) ? record.results : null) ??
      (Array.isArray(record.items) ? record.items : null) ??
      (Array.isArray(record.candidates) ? record.candidates : null);

    return Array.isArray(candidates) ? candidates : [];
  }

  private stripJsonFences(text: string) {
    const trimmed = text.trim();
    if (trimmed.startsWith("```")) {
      return trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    }

    return trimmed;
  }

  private extractResponseText(response: unknown) {
    const outputText = (response as { output_text?: string }).output_text;
    if (typeof outputText === "string" && outputText.trim()) {
      return outputText;
    }

    const output = (response as { output?: Array<Record<string, unknown>> }).output;
    if (!Array.isArray(output)) {
      return "";
    }

    const chunks: string[] = [];
    for (const item of output) {
      const content = item.content;
      if (!Array.isArray(content)) continue;

      for (const entry of content) {
        if (
          entry &&
          typeof entry === "object" &&
          "text" in entry &&
          typeof (entry as { text?: unknown }).text === "string"
        ) {
          chunks.push((entry as { text: string }).text);
        }
      }
    }

    return chunks.join("\n").trim();
  }

  private extractBoardCandidatesFromSearchResponse(
    html: string,
    source: Exclude<ExternalJobSource, "adzuna">,
  ) {
    const sourceUrls = this.extractSearchSourceUrlsFromHtml(html);
    const boards = [
      ...this.extractBoardCandidatesFromSourceUrls(sourceUrls, source),
      ...[html].flatMap((text) => {
        try {
          return extractBoardsFromText(text, text).filter((candidate) => candidate.source === source);
        } catch {
          return [];
        }
      }),
    ];

    return boards
      .map((board) =>
        this.normalizeBoardCandidate({
          source: board.source,
          boardToken: board.boardToken,
          evidenceUrl: board.evidenceUrl,
        }),
      )
      .filter((candidate): candidate is CandidateBoardInput => Boolean(candidate));
  }

  private extractBoardCandidatesFromSourceUrls(
    sourceUrls: string[],
    source: Exclude<ExternalJobSource, "adzuna">,
  ) {
    return sourceUrls.flatMap((text) => {
      try {
        return extractBoardsFromText(text, text).filter((candidate) => candidate.source === source);
      } catch {
        return [];
      }
    });
  }

  private extractWebSearchSourceUrls(response: unknown) {
    const urls = new Set<string>();
    const output = (response as { output?: Array<Record<string, unknown>> }).output;

    if (!Array.isArray(output)) {
      return [];
    }

    for (const item of output) {
      if (item.type === "web_search_call") {
        const action = item.action as { sources?: Array<{ type?: string; url?: string }> } | undefined;
        if (Array.isArray(action?.sources)) {
          for (const source of action.sources) {
            if (source?.type === "url" && typeof source.url === "string") {
              urls.add(source.url);
            }
          }
        }
      }

      const content = item.content;
      if (!Array.isArray(content)) {
        continue;
      }

      for (const entry of content) {
        const annotations = (entry as { annotations?: Array<{ type?: string; url?: string }> }).annotations;
        if (!Array.isArray(annotations)) {
          continue;
        }

        for (const annotation of annotations) {
          if (annotation?.type === "url_citation" && typeof annotation.url === "string") {
            urls.add(annotation.url);
          }
        }
      }
    }

    return Array.from(urls);
  }

  private extractSearchSourceUrlsFromHtml(html: string) {
    const urls: string[] = [];

    for (const match of html.matchAll(/href="([^"]+)"/gi)) {
      const href = match[1];
      if (!href) continue;

      const decoded = this.decodeSearchHref(href);
      if (!decoded) continue;
      urls.push(decoded);
    }

    return Array.from(new Set(urls));
  }

  private isSearchAnomalyPage(html: string) {
    return /anomaly\.js\?/i.test(html) || /id="img-form"/i.test(html);
  }

  private decodeSearchHref(href: string) {
    const cleaned = href.replace(/&amp;/g, "&").trim();

    try {
      if (cleaned.startsWith("/l/?")) {
        const url = new URL(`https://html.duckduckgo.com${cleaned}`);
        const target = url.searchParams.get("uddg");
        return target ? decodeURIComponent(target) : null;
      }

      if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
        return cleaned;
      }
    } catch {
      return null;
    }

    return null;
  }

  private normalizeSourcedCandidateCompany(
    company: {
      company?: string;
      homepage?: string;
      careersUrl?: string | null;
      companyDomain?: string | null;
      segments?: string[];
      sourceHint?: string | null;
      confidence?: number | null;
      notes?: string | null;
    },
    tier: CandidateSourceTier,
    focusAreas: string[],
  ) {
    if (!company.company || !company.homepage) {
      return null;
    }

    try {
      const homepage = this.normalizeUrl(company.homepage);
      const careersUrl = company.careersUrl ? this.normalizeUrl(company.careersUrl) : undefined;

      const normalizedSegments = Array.from(
        new Set([...(company.segments ?? []), ...focusAreas].map((segment) => segment.trim()).filter(Boolean)),
      );

      return {
        company: company.company.trim(),
        homepage,
        careersUrl,
        companyDomain: company.companyDomain?.trim() || this.domainFromUrl(homepage) || undefined,
        segments: normalizedSegments,
        sourceHint: undefined,
        confidence:
          typeof company.confidence === "number"
            ? Math.max(0, Math.min(company.confidence, 1))
            : tier === "top"
              ? 0.9
              : tier === "priority"
                ? 0.82
                : 0.74,
        origin: `web_search:${tier}`,
        notes: company.notes ?? `Auto-sourced via web search for ${tier} companies.`,
      };
    } catch {
      return null;
    }
  }

  private normalizeBoardCandidate(candidate: CandidateBoardInput) {
    const normalizedToken = candidate.boardToken.trim();
    if (!normalizedToken) {
      return null;
    }

    const evidenceUrl = this.canonicalBoardUrl(candidate.source, normalizedToken, candidate.evidenceUrl);
    if (!evidenceUrl) {
      return null;
    }

    return {
      source: candidate.source,
      boardToken: normalizedToken,
      evidenceUrl,
    };
  }

  private canonicalBoardUrl(
    source: ExternalJobSource,
    boardToken: string,
    evidenceUrl?: string,
  ) {
    const fallbackBySource: Record<Exclude<ExternalJobSource, "adzuna">, string> = {
      greenhouse: `https://job-boards.greenhouse.io/${boardToken}`,
      lever: `https://jobs.lever.co/${boardToken}`,
      ashby: `https://jobs.ashbyhq.com/${boardToken}`,
    };

    try {
      if (evidenceUrl) {
        const parsed = new URL(evidenceUrl);
        const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();

        if (
          (source === "greenhouse" &&
            (hostname === "job-boards.greenhouse.io" || hostname === "boards.greenhouse.io")) ||
          (source === "lever" && hostname === "jobs.lever.co") ||
          (source === "ashby" && hostname === "jobs.ashbyhq.com")
        ) {
          return `${parsed.protocol}//${parsed.hostname}/${boardToken}`;
        }
      }
    } catch {
      return fallbackBySource[source as Exclude<ExternalJobSource, "adzuna">];
    }

    return fallbackBySource[source as Exclude<ExternalJobSource, "adzuna">];
  }

  private async filterNewBoardCandidates(candidates: CandidateBoardInput[]) {
    const [existingCandidateBoards, existingSourceBoards] = await Promise.all([
      (this.prisma as any).candidateBoard.findMany({
        where: {
          status: {
            in: ["discovered", "validating", "validated"],
          },
        },
        select: {
          sourceName: true,
          boardToken: true,
        },
      }),
      (this.prisma as any).sourceBoard.findMany({
        where: {
          active: true,
        },
        select: {
          sourceName: true,
          boardToken: true,
        },
      }),
    ]);

    const knownBoards = new Set<string>(
      [
        ...existingCandidateBoards.map((board: { sourceName: string; boardToken: string }) => `${board.sourceName}:${board.boardToken}`),
        ...existingSourceBoards.map((board: { sourceName: string; boardToken: string }) => `${board.sourceName}:${board.boardToken}`),
      ],
    );
    const seenBoards = new Set<string>();

    const kept: CandidateBoardInput[] = [];
    const skipped: CandidateBoardInput[] = [];

    for (const candidate of candidates) {
      const key = `${candidate.source}:${candidate.boardToken}`;
      if (knownBoards.has(key) || seenBoards.has(key)) {
        skipped.push(candidate);
        continue;
      }

      seenBoards.add(key);
      kept.push(candidate);
    }

    return { kept, skipped };
  }

  private async validateBoardCandidates(candidates: CandidateBoardInput[], targetValidatedCount?: number) {
    const createdCompanies: Array<Record<string, unknown>> = [];
    const createdBoards: Array<Record<string, unknown>> = [];
    const failedValidations: Array<{
      source: string;
      boardToken: string;
      reason: string;
      evidenceUrl: string;
    }> = [];

    for (const candidate of candidates) {
      try {
        const adapter = this.adapters[candidate.source];
        const jobs = await adapter.fetchJobs(candidate.boardToken);
        const usJobs = jobs.filter((job) => isUsRelevantJob(job));
        if (!jobs.length) {
          await this.persistRejectedBoardCandidate(candidate, "validated but returned no jobs");
          failedValidations.push({
            source: candidate.source,
            boardToken: candidate.boardToken,
            reason: "validated but returned no jobs",
            evidenceUrl: candidate.evidenceUrl,
          });
          continue;
        }

        if (!usJobs.length) {
          await this.persistRejectedBoardCandidate(candidate, "validated but returned no US jobs");
          failedValidations.push({
            source: candidate.source,
            boardToken: candidate.boardToken,
            reason: "validated but returned no US jobs",
            evidenceUrl: candidate.evidenceUrl,
          });
          continue;
        }

        const firstJob = usJobs[0] ?? jobs[0];
        if (!firstJob) {
          await this.persistRejectedBoardCandidate(candidate, "no jobs available after validation");
          failedValidations.push({
            source: candidate.source,
            boardToken: candidate.boardToken,
            reason: "no jobs available after validation",
            evidenceUrl: candidate.evidenceUrl,
          });
          continue;
        }

        const companyName = firstJob.company?.trim();
        if (!companyName) {
          await this.persistRejectedBoardCandidate(candidate, "could not derive company name from jobs payload");
          failedValidations.push({
            source: candidate.source,
            boardToken: candidate.boardToken,
            reason: "could not derive company name from jobs payload",
            evidenceUrl: candidate.evidenceUrl,
          });
          continue;
        }

        const companyDomain =
          this.companyDomain(firstJob.companyLogoUrl) ??
          this.publicCompanyDomainFromUrl(firstJob.applyUrl) ??
          undefined;
        const homepage = companyDomain ? `https://${companyDomain}` : candidate.evidenceUrl;

        const candidateCompany = await this.findOrCreateCandidateCompanyFromBoard({
          company: companyName,
          homepage,
          companyDomain,
          source: candidate.source,
          boardToken: candidate.boardToken,
          evidenceUrl: candidate.evidenceUrl,
        });

        const candidateBoard = await (this.prisma as any).candidateBoard.upsert({
          where: {
            sourceName_boardToken_candidateCompanyId: {
              sourceName: candidate.source,
              boardToken: candidate.boardToken,
              candidateCompanyId: candidateCompany.id,
            },
          },
          create: {
            candidateCompanyId: candidateCompany.id,
            sourceName: candidate.source,
            boardToken: candidate.boardToken,
            evidenceUrl: candidate.evidenceUrl,
            status: "validated",
            validatedAt: new Date(),
          },
          update: {
            evidenceUrl: candidate.evidenceUrl,
            status: "validated",
            validationError: null,
            validatedAt: new Date(),
          },
        });

        await (this.prisma as any).candidateCompany.update({
          where: { id: candidateCompany.id },
          data: {
            status: "discovered",
            lastDiscoveredAt: new Date(),
            lastDiscoveryError: null,
          },
        });

        createdCompanies.push(candidateCompany);
        createdBoards.push(candidateBoard);

        if (targetValidatedCount && createdBoards.length >= targetValidatedCount) {
          break;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown validation error";
        await this.persistRejectedBoardCandidate(candidate, reason);
        failedValidations.push({
          source: candidate.source,
          boardToken: candidate.boardToken,
          reason,
          evidenceUrl: candidate.evidenceUrl,
        });
      }
    }

    return {
      createdCompanies,
      createdBoards,
      failedValidations,
    };
  }

  private async findOrCreateCandidateCompanyFromBoard(input: {
    company: string;
    homepage: string;
    companyDomain?: string;
    source: ExternalJobSource;
    boardToken: string;
    evidenceUrl: string;
  }) {
    const normalizedName = this.normalizeCompanyName(input.company);
    const normalizedHomepage = this.normalizeUrl(input.homepage);
    const normalizedDomain =
      input.companyDomain?.trim().toLowerCase() ??
      this.publicCompanyDomainFromUrl(normalizedHomepage) ??
      null;

    const existingCandidates = await (this.prisma as any).candidateCompany.findMany({
      where: {
        OR: [
          { homepage: normalizedHomepage },
          ...(normalizedDomain ? [{ companyDomain: normalizedDomain }] : []),
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 5,
    });

    const existingByName = existingCandidates.find(
      (candidate: { company: string }) =>
        this.normalizeCompanyName(candidate.company) === normalizedName,
    );

    const existingByHomepage = existingCandidates.find(
      (candidate: { homepage?: string | null }) =>
        candidate.homepage && this.normalizeUrl(candidate.homepage) === normalizedHomepage,
    );

    const existing = existingByName ?? existingByHomepage ?? null;

    if (existing) {
      return (this.prisma as any).candidateCompany.update({
        where: { id: existing.id },
        data: {
          company: input.company,
          homepage: normalizedHomepage,
          companyDomain: normalizedDomain,
          careersUrl: existing.careersUrl ?? input.evidenceUrl,
          origin: existing.origin ?? "board_first_search",
          notes: existing.notes ?? `Derived from ${input.source} board ${input.boardToken}`,
        },
      });
    }

    return (this.prisma as any).candidateCompany.create({
      data: {
        company: input.company,
        homepage: normalizedHomepage,
        careersUrl: input.evidenceUrl,
        companyDomain: normalizedDomain,
        segments: [],
        origin: "board_first_search",
        notes: `Derived from ${input.source} board ${input.boardToken}`,
        confidence: normalizedDomain ? 0.92 : 0.78,
      },
    });
  }

  private async persistRejectedBoardCandidate(candidate: CandidateBoardInput, reason: string) {
    const candidateCompany = await this.findOrCreateCandidateCompanyFromBoard({
      company: formatBoardToken(candidate.boardToken),
      homepage: candidate.evidenceUrl,
      companyDomain: this.publicCompanyDomainFromUrl(candidate.evidenceUrl) ?? undefined,
      source: candidate.source,
      boardToken: candidate.boardToken,
      evidenceUrl: candidate.evidenceUrl,
    });

    const candidateBoard = await (this.prisma as any).candidateBoard.upsert({
      where: {
        sourceName_boardToken_candidateCompanyId: {
          sourceName: candidate.source,
          boardToken: candidate.boardToken,
          candidateCompanyId: candidateCompany.id,
        },
      },
      create: {
        candidateCompanyId: candidateCompany.id,
        sourceName: candidate.source,
        boardToken: candidate.boardToken,
        evidenceUrl: candidate.evidenceUrl,
        status: "rejected",
        validationError: reason,
        validatedAt: new Date(),
      },
      update: {
        evidenceUrl: candidate.evidenceUrl,
        status: "rejected",
        validationError: reason,
        validatedAt: new Date(),
      },
    });

    await (this.prisma as any).candidateCompany.update({
      where: { id: candidateCompany.id },
      data: {
        status: "failed",
        lastDiscoveredAt: new Date(),
        lastDiscoveryError: reason,
      },
    });

    return candidateBoard;
  }

  private publicCompanyDomainFromUrl(url?: string | null) {
    const domain = this.domainFromUrl(url);
    if (!domain) {
      return null;
    }

    const atsHosts = new Set([
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "jobs.lever.co",
      "jobs.ashbyhq.com",
      "boards-api.greenhouse.io",
      "api.lever.co",
      "api.ashbyhq.com",
    ]);

    return atsHosts.has(domain) ? null : domain;
  }

  private async filterNewCandidateCompanies(
    companies: Array<{
      company: string;
      homepage: string;
      careersUrl?: string;
      companyDomain?: string;
      segments?: string[];
      sourceHint?: string;
      confidence?: number;
      origin?: string;
      notes?: string;
    }>,
  ) {
    const [existingCandidates, existingBoards] = await Promise.all([
      (this.prisma as any).candidateCompany.findMany({
        select: {
          company: true,
          homepage: true,
          companyDomain: true,
        },
      }),
      (this.prisma as any).sourceBoard.findMany({
        select: {
          company: true,
          companyDomain: true,
        },
      }),
    ]);

    const knownNames = new Set<string>();
    const knownHomepages = new Set<string>();
    const knownDomains = new Set<string>();

    for (const company of existingCandidates) {
      knownNames.add(this.normalizeCompanyName(company.company));
      if (company.homepage) {
        knownHomepages.add(this.normalizeUrl(company.homepage));
      }
      if (company.companyDomain) {
        knownDomains.add(company.companyDomain.trim().toLowerCase());
      }
    }

    for (const board of existingBoards) {
      knownNames.add(this.normalizeCompanyName(board.company));
      if (board.companyDomain) {
        knownDomains.add(board.companyDomain.trim().toLowerCase());
      }
    }

    const seenNames = new Set<string>();
    const seenHomepages = new Set<string>();
    const seenDomains = new Set<string>();

    return companies.filter((company) => {
      const normalizedName = this.normalizeCompanyName(company.company);
      const normalizedHomepage = this.normalizeUrl(company.homepage);
      const normalizedDomain =
        company.companyDomain?.trim().toLowerCase() ?? this.domainFromUrl(normalizedHomepage) ?? undefined;

      if (
        seenNames.has(normalizedName) ||
        seenHomepages.has(normalizedHomepage) ||
        (normalizedDomain ? seenDomains.has(normalizedDomain) : false)
      ) {
        return false;
      }

      if (
        knownNames.has(normalizedName) ||
        knownHomepages.has(normalizedHomepage) ||
        (normalizedDomain ? knownDomains.has(normalizedDomain) : false)
      ) {
        return false;
      }

      seenNames.add(normalizedName);
      seenHomepages.add(normalizedHomepage);
      if (normalizedDomain) {
        seenDomains.add(normalizedDomain);
      }

      return true;
    });
  }

  private normalizeCompanyName(company: string) {
    return company
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private targetCompanyDomain(company: string) {
    const normalized = company.trim().toLowerCase();
    return (
      getTargetCompanies().find((candidate) => candidate.company.trim().toLowerCase() === normalized)
        ?.domain ?? null
    );
  }

  private groupPersistedJobsByBoard(
    jobs: Array<{
      sourceKey: string;
      sourceName: string;
      boardToken: string | null;
      title: string;
      company: string;
      companyDomain: string | null;
      companyLogoUrl: string | null;
      location: string | null;
      employmentType: string | null;
      remoteType: string | null;
      description: string;
      applyUrl: string;
      postedAt: Date | null;
    }>,
    boardDomains = new Map<string, string | null>(),
  ) {
    const grouped = new Map<string, AggregatedJob[]>();

    for (const job of jobs) {
      const source = job.sourceName as ExternalJobSource;
      const boardToken = job.boardToken ?? "unknown";
      const key = `${source}:${boardToken}`;
      const current = grouped.get(key) ?? [];
      const resolvedDomain =
        job.companyDomain ?? boardDomains.get(key) ?? this.targetCompanyDomain(job.company);

      current.push({
        id: job.sourceKey,
        source,
        boardToken,
        title: job.title,
        company: job.company,
        companyLogoUrl: job.companyLogoUrl ?? this.logoUrlForDomain(resolvedDomain),
        location: job.location,
        workMode: job.remoteType,
        employmentType: job.employmentType,
        salary: null,
        description: job.description,
        applyUrl: job.applyUrl,
        postedAt: job.postedAt?.toISOString() ?? null,
        department: null,
        team: null,
      });

      grouped.set(key, current);
    }

    return Array.from(grouped.values());
  }

  private mapPersistedJobs(
    jobs: Array<{
      sourceKey: string;
      sourceName: string;
      boardToken: string | null;
      title: string;
      company: string;
      companyDomain: string | null;
      companyLogoUrl: string | null;
      location: string | null;
      employmentType: string | null;
      remoteType: string | null;
      description: string;
      applyUrl: string;
      postedAt: Date | null;
    }>,
    boardDomains = new Map<string, string | null>(),
  ) {
    return jobs.map((job) => {
      const source = job.sourceName as ExternalJobSource;
      const boardToken = job.boardToken ?? "unknown";
      const resolvedDomain =
        job.companyDomain ??
        boardDomains.get(`${source}:${boardToken}`) ??
        this.targetCompanyDomain(job.company);

      return {
        id: job.sourceKey,
        source,
        boardToken,
        title: job.title,
        company: job.company,
        companyLogoUrl: job.companyLogoUrl ?? this.logoUrlForDomain(resolvedDomain),
        location: job.location,
        workMode: job.remoteType,
        employmentType: job.employmentType,
        salary: null,
        description: job.description,
        applyUrl: job.applyUrl,
        postedAt: job.postedAt?.toISOString() ?? null,
        department: null,
        team: null,
      } satisfies AggregatedJob;
    });
  }

  private encodeFeedCursor(job: { updatedAt: Date; sourceKey: string }) {
    return Buffer.from(
      JSON.stringify({
        updatedAt: job.updatedAt.toISOString(),
        sourceKey: job.sourceKey,
      }),
    ).toString("base64url");
  }

  private decodeFeedCursor(cursor?: string | null) {
    if (!cursor) return null;

    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
        updatedAt?: string;
        sourceKey?: string;
      };

      if (!parsed.updatedAt || !parsed.sourceKey) {
        return null;
      }

      const updatedAt = new Date(parsed.updatedAt);
      if (Number.isNaN(updatedAt.getTime())) {
        return null;
      }

      return {
        updatedAt,
        sourceKey: parsed.sourceKey,
      };
    } catch {
      return null;
    }
  }
}
