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
import { RecruiteeAdapter } from "./adapters/recruitee.adapter";
import { SmartRecruitersAdapter } from "./adapters/smartrecruiters.adapter";
import { WorkableAdapter } from "./adapters/workable.adapter";
import { getStarterBoardCatalog, getStarterBoards, getStarterBoardSummary } from "./board-catalog";
import { extractBoardsFromText } from "./board-discovery";
import { getCandidateSeedCompanies, getCandidateSeedGroups } from "./candidate-company-catalog";
import { formatBoardToken } from "./source-formatters";
import { getTargetCompanies } from "./target-company-catalog";
import type { AggregateJobsResult, SourceAdapter } from "./jobs.types";
import { stripHtml } from "./jobs.utils";
import { PrismaService } from "../prisma/prisma.service";

type CandidateSourceTier = "top" | "priority" | "growth";
type CandidateEvidenceKind = "api_url" | "job_posting_url" | "board_root_url" | "unknown";
type CandidateEvidenceSource = "direct_search" | "openai_citation" | "openai_text";
type CandidateBoardInput = {
  source: ExternalJobSource;
  boardToken: string;
  evidenceUrl: string;
  evidenceKind?: CandidateEvidenceKind;
  evidenceSource?: CandidateEvidenceSource;
};
type SourceUrlEvidence = {
  url: string;
  evidenceSource: CandidateEvidenceSource;
};
type BoardFirstSource = Exclude<ExternalJobSource, "adzuna">;
type WorkableXmlJob = {
  title?: string | null;
  date?: string | null;
  referencenumber?: string | null;
  url?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  remote?: string | null;
  description?: string | null;
};

type WorkableXmlIngestInput = {
  limit?: number;
  maxRecords?: number;
  freshDays?: number;
  dryRun?: boolean;
};

type WorkableXmlIngestStats = {
  sourceName: "workable_xml";
  feedUrl: string;
  dryRun: boolean;
  limit: number;
  maxRecords: number;
  freshDays: number;
  seen: number;
  parsed: number;
  fresh: number;
  usRelevant: number;
  targetRole: number;
  inserted: number;
  updated: number;
  persisted: number;
  skippedOld: number;
  skippedMissingRequired: number;
  skippedNonUs: number;
  skippedNonTarget: number;
  skippedDuplicate: number;
  skippedPersistError: number;
  persistErrors: Array<{
    sourceKey: string;
    title: string;
    company: string;
    message: string;
  }>;
  stoppedReason: "limit_reached" | "max_records_reached" | "feed_complete";
};

type PersistedJobDedupeRow = {
  sourceKey: string;
  sourceId: string | null;
  sourceName: string;
  title: string;
  company: string;
  location: string | null;
  applyUrl: string;
};

type PersistedJobDedupeIndex = {
  bySourceKey: Map<string, PersistedJobDedupeRow>;
  byApplyUrl: Map<string, PersistedJobDedupeRow>;
  byWorkableId: Map<string, PersistedJobDedupeRow>;
  byCompanyTitle: Map<string, PersistedJobDedupeRow[]>;
};

const BOARD_FIRST_SOURCES: BoardFirstSource[] = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
];
const SUPPORTED_ATS_SOURCES = new Set<BoardFirstSource>(BOARD_FIRST_SOURCES);
const BOARD_REJECTION_COOLDOWN_DAYS = 14;
const WORKABLE_XML_FEED_URL = "https://www.workable.com/boards/workable.xml";
const WORKABLE_XML_SOURCE_NAME = "workable_xml";

const DEFAULT_CANDIDATE_FOCUS_AREAS = [
  "software engineering",
  "data",
  "product",
  "qa",
  "cloud infrastructure",
  "security",
  "it support",
  "business systems",
  "erp crm",
  "design",
];

@Injectable()
export class JobsService {
  private readonly adapters: Record<ExternalJobSource, SourceAdapter>;
  private readonly openaiClient: OpenAI | null;
  private readonly openaiBoardFallbackEnabled: boolean;
  private readonly openaiCompanySourcingEnabled: boolean;
  private readonly openaiCompanyEnrichmentEnabled: boolean;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GreenhouseAdapter) greenhouseAdapter: GreenhouseAdapter,
    @Inject(LeverAdapter) leverAdapter: LeverAdapter,
    @Inject(AshbyAdapter) ashbyAdapter: AshbyAdapter,
    @Inject(WorkableAdapter) workableAdapter: WorkableAdapter,
    @Inject(SmartRecruitersAdapter) smartRecruitersAdapter: SmartRecruitersAdapter,
    @Inject(RecruiteeAdapter) recruiteeAdapter: RecruiteeAdapter,
  ) {
    this.adapters = {
      greenhouse: greenhouseAdapter,
      lever: leverAdapter,
      ashby: ashbyAdapter,
      workable: workableAdapter,
      smartrecruiters: smartRecruitersAdapter,
      recruitee: recruiteeAdapter,
      adzuna: {
        source: "adzuna",
        async fetchJobs(): Promise<AggregatedJob[]> {
          throw new Error("Adzuna adapter is not configured yet");
        },
      },
    };

    const openAiApiKey = this.configService.get<string>("OPENAI_API_KEY");
    this.openaiClient = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
    this.openaiBoardFallbackEnabled = this.configService.get<string>("ENABLE_OPENAI_BOARD_FALLBACK") === "true";
    this.openaiCompanySourcingEnabled =
      this.configService.get<string>("ENABLE_OPENAI_COMPANY_SOURCING") === "true";
    this.openaiCompanyEnrichmentEnabled =
      this.configService.get<string>("ENABLE_OPENAI_COMPANY_ENRICHMENT") === "true";
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
    if (!this.openaiClient || !this.openaiCompanySourcingEnabled) {
      throw new Error(
        "OpenAI company sourcing is disabled. Set ENABLE_OPENAI_COMPANY_SOURCING=true with OPENAI_API_KEY to use it.",
      );
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
                "Use sourceHint only if the web evidence strongly suggests greenhouse, lever, ashby, workable, smartrecruiters, or recruitee; otherwise null.",
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

    const selectedSources = this.resolveBoardFirstSources(input?.customQuery);
    const limitsBySource = this.distributeBoardSourceLimit(limit, selectedSources);
    const discoveredBySource = await this.harvestDirectBoardCandidates({
      limit,
      sources: selectedSources,
      limitsBySource,
      focusAreas,
      customQuery: input?.customQuery,
    });
    let discoveredBoards = discoveredBySource.flatMap((entry) => entry.candidates);
    let { kept: dedupedCandidates, skipped: skippedDuplicateBoards } =
      await this.filterNewBoardCandidates(discoveredBoards);
    const backfillRounds: Array<Record<string, unknown>> = [];

    if (this.openaiBoardFallbackEnabled && this.openaiClient && dedupedCandidates.length < limit) {
      for (let round = 1; round <= 2 && dedupedCandidates.length < limit; round += 1) {
        const backfillBySource = await this.harvestBackfillBoardCandidates({
          round,
          sources: selectedSources,
          limitsBySource,
          focusAreas,
          customQuery: input?.customQuery,
          knownCandidates: discoveredBoards,
          keptCandidates: dedupedCandidates,
        });
        const backfillCandidates = backfillBySource.flatMap((entry) => entry.candidates);

        if (!backfillCandidates.length) {
          break;
        }

        for (const entry of backfillBySource) {
          const sourceEntry = discoveredBySource.find((item) => item.source === entry.source);
          if (!sourceEntry) continue;

          sourceEntry.candidates.push(...entry.candidates);
          sourceEntry.queriesTried += entry.queriesTried;
          sourceEntry.pagesFetched += entry.pagesFetched;
        }

        discoveredBoards = this.uniqueBoardCandidates([...discoveredBoards, ...backfillCandidates]);
        ({ kept: dedupedCandidates, skipped: skippedDuplicateBoards } =
          await this.filterNewBoardCandidates(discoveredBoards));

        backfillRounds.push({
          round,
          discovered: backfillCandidates.length,
          dedupedTotal: dedupedCandidates.length,
          sourceBreakdown: Object.fromEntries(
            backfillBySource.map((entry) => [entry.source, entry.candidates.length]),
          ),
        });
      }
    }

    const rawText = discoveredBySource
      .map(
        (entry) =>
          `# ${entry.source}\nqueries=${entry.queriesTried}\npages=${entry.pagesFetched}\ndiscovered=${entry.candidates.length}`,
      )
      .join("\n\n");
    const validationPool = this.interleaveCandidateBoardGroups(
      selectedSources.map((source) =>
        dedupedCandidates.filter((candidate) => candidate.source === source),
      ),
      Math.min(Math.max(limit * 6, limit), dedupedCandidates.length),
    );
    const validatedBoards = await this.validateBoardCandidates(validationPool, limit);
    const emptySourceCounts = () =>
      Object.fromEntries(selectedSources.map((source) => [source, 0])) as Partial<Record<BoardFirstSource, number>>;
    const createdBoardsBySource = validatedBoards.createdBoards.reduce<Partial<Record<BoardFirstSource, number>>>(
      (acc, board) => {
        const sourceName =
          typeof (board as { sourceName?: unknown }).sourceName === "string"
            ? ((board as { sourceName: BoardFirstSource }).sourceName)
            : null;
        if (sourceName && sourceName in acc) {
          acc[sourceName] = (acc[sourceName] ?? 0) + 1;
        }
        return acc;
      },
      emptySourceCounts(),
    );
    const failedBoardsBySource = validatedBoards.failedValidations.reduce<Partial<Record<BoardFirstSource, number>>>(
      (acc, failure) => {
        const sourceName = SUPPORTED_ATS_SOURCES.has(failure.source as BoardFirstSource)
          ? (failure.source as BoardFirstSource)
          : null;
        if (sourceName && sourceName in acc) {
          acc[sourceName] = (acc[sourceName] ?? 0) + 1;
        }
        return acc;
      },
      emptySourceCounts(),
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
      llmAssistanceEnabled: this.openaiBoardFallbackEnabled && Boolean(this.openaiClient),
      sources: selectedSources,
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
            validated: createdBoardsBySource[entry.source] ?? 0,
            failed: failedBoardsBySource[entry.source] ?? 0,
            pagesFetched: entry.pagesFetched,
            queriesTried: entry.queriesTried,
            searchBlocked: entry.searchBlocked,
          },
        ]),
      ),
      debug: {
        rawTextPreview: rawText.slice(0, 1200),
        directSearchBlockedCount: discoveredBySource.filter((entry) => entry.searchBlocked).length,
        llmAssistanceEnabled: this.openaiBoardFallbackEnabled && Boolean(this.openaiClient),
        failedValidationCount: validatedBoards.failedValidations.length,
        failedValidations: validatedBoards.failedValidations.slice(0, 10),
        skippedDuplicateBoards: skippedDuplicateBoards.slice(0, 10),
        backfillRounds,
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
    const skippedDuplicates = [];
    const seenNames = new Set<string>();
    const seenHomepages = new Set<string>();
    const seenDomains = new Set<string>();

    for (const company of companies) {
      const homepage = this.normalizeUrl(company.homepage);
      const careersUrl = company.careersUrl ? this.normalizeUrl(company.careersUrl) : null;
      const normalizedName = this.normalizeCompanyName(company.company);
      const normalizedDomain =
        company.companyDomain?.trim().toLowerCase() ?? this.domainFromUrl(homepage);

      if (
        seenNames.has(normalizedName) ||
        seenHomepages.has(homepage) ||
        (normalizedDomain ? seenDomains.has(normalizedDomain) : false)
      ) {
        skippedDuplicates.push({
          company: company.company,
          homepage,
          companyDomain: normalizedDomain,
          reason: "duplicate_in_import_payload",
        });
        continue;
      }

      seenNames.add(normalizedName);
      seenHomepages.add(homepage);
      if (normalizedDomain) {
        seenDomains.add(normalizedDomain);
      }

      const metadataUpdate = {
        careersUrl,
        companyDomain: normalizedDomain,
        segments: company.segments ?? [],
        sourceHint: company.sourceHint ?? null,
        confidence: company.confidence ?? null,
        origin: company.origin ?? "manual_import",
        notes: company.notes ?? null,
      };

      const existingCandidates = await (this.prisma as any).candidateCompany.findMany({
        where: {
          OR: [
            { company: company.company, homepage },
            { homepage },
            ...(normalizedDomain ? [{ companyDomain: normalizedDomain }] : []),
          ],
        },
        select: {
          id: true,
          company: true,
          homepage: true,
          companyDomain: true,
          segments: true,
          status: true,
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 5,
      });
      const existing =
        existingCandidates.find(
          (candidate: { company: string; homepage: string }) =>
            candidate.company === company.company && this.normalizeUrl(candidate.homepage) === homepage,
        ) ??
        existingCandidates.find(
          (candidate: { companyDomain?: string | null }) =>
            normalizedDomain && candidate.companyDomain?.trim().toLowerCase() === normalizedDomain,
        ) ??
        existingCandidates.find(
          (candidate: { homepage: string }) => this.normalizeUrl(candidate.homepage) === homepage,
        ) ??
        null;

      let record;
      if (existing) {
        const resetableStatuses = ["candidate", "no_supported_board", "failed"];
        record = await (this.prisma as any).candidateCompany.update({
          where: { id: existing.id },
          data: {
            company: company.company,
            homepage,
            ...metadataUpdate,
            segments: Array.from(new Set([...(existing.segments ?? []), ...(company.segments ?? [])])),
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
      skipped: skippedDuplicates.length,
      skippedDuplicates: skippedDuplicates.slice(0, 20),
      companies: results,
    };
  }

  async upsertCandidateBoards(
    boards: Array<{
      company: string;
      homepage?: string;
      companyDomain?: string;
      ats?: string;
      sourceName?: string;
      boardToken: string;
      boardUrl?: string;
      evidenceUrl?: string;
      segments?: string[];
      origin?: string;
      notes?: string;
    }>,
  ) {
    const imported = [];
    const skipped = [];
    const seen = new Set<string>();

    for (const board of boards) {
      const source = (board.sourceName ?? board.ats ?? "").trim().toLowerCase() as BoardFirstSource;
      const boardToken = board.boardToken?.trim();

      if (!SUPPORTED_ATS_SOURCES.has(source) || !boardToken) {
        skipped.push({
          company: board.company,
          source,
          boardToken,
          reason: "invalid_source_or_board_token",
        });
        continue;
      }

      const normalized = this.normalizeBoardCandidate({
        source,
        boardToken,
        evidenceUrl: board.boardUrl ?? board.evidenceUrl ?? this.canonicalBoardUrl(source, boardToken),
        evidenceKind: "board_root_url",
        evidenceSource: "direct_search",
      });

      if (!normalized) {
        skipped.push({
          company: board.company,
          source,
          boardToken,
          reason: "invalid_board_url_or_token",
        });
        continue;
      }

      const key = `${normalized.source}:${normalized.boardToken.toLowerCase()}`;
      if (seen.has(key)) {
        skipped.push({
          company: board.company,
          source: normalized.source,
          boardToken: normalized.boardToken,
          reason: "duplicate_in_import_payload",
        });
        continue;
      }
      seen.add(key);

      const [existingSourceBoard, existingCandidateBoard] = await Promise.all([
        (this.prisma as any).sourceBoard.findUnique({
          where: {
            sourceName_boardToken: {
              sourceName: normalized.source,
              boardToken: normalized.boardToken,
            },
          },
          select: { id: true },
        }),
        (this.prisma as any).candidateBoard.findFirst({
          where: {
            sourceName: normalized.source,
            boardToken: normalized.boardToken,
            status: {
              in: ["discovered", "validating", "validated", "promoted"],
            },
          },
          select: { id: true },
        }),
      ]);

      if (existingSourceBoard) {
        skipped.push({
          company: board.company,
          source: normalized.source,
          boardToken: normalized.boardToken,
          reason: "already_in_source_boards",
        });
        continue;
      }

      if (existingCandidateBoard) {
        skipped.push({
          company: board.company,
          source: normalized.source,
          boardToken: normalized.boardToken,
          reason: "already_in_candidate_boards",
        });
        continue;
      }

      const candidateCompany = await this.findOrCreateCandidateCompanyFromBoard({
        company: board.company,
        homepage: board.homepage?.trim() || normalized.evidenceUrl,
        companyDomain: board.companyDomain?.trim() || undefined,
        source: normalized.source,
        boardToken: normalized.boardToken,
        evidenceUrl: normalized.evidenceUrl,
      });

      const candidateBoard = await (this.prisma as any).candidateBoard.upsert({
        where: {
          sourceName_boardToken_candidateCompanyId: {
            sourceName: normalized.source,
            boardToken: normalized.boardToken,
            candidateCompanyId: candidateCompany.id,
          },
        },
        create: {
          candidateCompanyId: candidateCompany.id,
          sourceName: normalized.source,
          boardToken: normalized.boardToken,
          evidenceUrl: normalized.evidenceUrl,
          status: "discovered",
        },
        update: {
          evidenceUrl: normalized.evidenceUrl,
          status: "discovered",
          validationError: null,
        },
      });

      await (this.prisma as any).candidateCompany.update({
        where: { id: candidateCompany.id },
        data: {
          status: "discovered",
          sourceHint: normalized.source,
          careersUrl: normalized.evidenceUrl,
          segments: board.segments ?? candidateCompany.segments ?? [],
          origin: board.origin ?? candidateCompany.origin ?? "manual:board-csv-import",
          notes:
            [board.notes, `boardImport=${normalized.source}/${normalized.boardToken}`]
              .filter(Boolean)
              .join(" | ") || candidateCompany.notes,
          lastDiscoveredAt: new Date(),
          lastDiscoveryError: null,
        },
      });

      imported.push({
        candidateCompanyId: candidateCompany.id,
        candidateBoardId: candidateBoard.id,
        company: candidateCompany.company,
        sourceName: normalized.source,
        boardToken: normalized.boardToken,
      });
    }

    return {
      imported: imported.length,
      skipped: skipped.length,
      skippedBoards: skipped.slice(0, 20),
      boards: imported,
    };
  }

  async enrichCandidateCompanies(limit = 25) {
    const candidates = await (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: ["candidate", "no_supported_board"],
        },
      },
      orderBy: [{ updatedAt: "asc" }, { confidence: "desc" }],
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
      llmAssistanceEnabled: results.some((result) => result.enrichmentSource === "scrape+llm"),
    };
  }

  async listCandidateCompanies() {
    return (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: ["candidate", "discovering", "discovered"],
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

  async listCandidateResearchBacklog() {
    return (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: ["no_supported_board", "failed"],
        },
      },
      include: {
        candidateBoards: {
          where: {
            status: {
              in: ["rejected"],
            },
          },
          orderBy: [{ updatedAt: "desc" }],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { company: "asc" }],
    });
  }

  async getCandidateDiscoveryTargets() {
    const candidates = await (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: ["candidate", "no_supported_board"],
        },
      },
    });

    return candidates.sort((left: any, right: any) => {
      const priorityDiff =
        this.candidateDiscoveryPriority(right) - this.candidateDiscoveryPriority(left);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const confidenceDiff = (right.confidence ?? 0) - (left.confidence ?? 0);
      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }

      const updatedDiff =
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      if (updatedDiff !== 0) {
        return updatedDiff;
      }

      return String(left.company).localeCompare(String(right.company));
    });
  }

  async getCandidatePipelineTargets(input?: { includeNoSupported?: boolean; limit?: number }) {
    const limit = Math.min(Math.max(input?.limit ?? 500, 1), 1000);
    const candidates = await (this.prisma as any).candidateCompany.findMany({
      where: {
        status: {
          in: input?.includeNoSupported ? ["candidate", "no_supported_board"] : ["candidate"],
        },
      },
    });

    return candidates
      .sort((left: any, right: any) => {
        const priorityDiff =
          this.candidateDiscoveryPriority(right) - this.candidateDiscoveryPriority(left);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        const confidenceDiff = (right.confidence ?? 0) - (left.confidence ?? 0);
        if (confidenceDiff !== 0) {
          return confidenceDiff;
        }

        const updatedDiff =
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        if (updatedDiff !== 0) {
          return updatedDiff;
        }

        return String(left.company).localeCompare(String(right.company));
      })
      .slice(0, limit);
  }

  private candidateDiscoveryPriority(candidate: {
    status?: string | null;
    sourceHint?: string | null;
    careersUrl?: string | null;
  }) {
    let priority = 0;

    if (candidate.status === "candidate") {
      priority += 20;
    }

    if (candidate.status === "no_supported_board") {
      priority -= 30;
    }

    if (
      SUPPORTED_ATS_SOURCES.has(candidate.sourceHint as Exclude<ExternalJobSource, "adzuna">)
    ) {
      priority += 200;
    }

    const careersUrl = candidate.careersUrl?.toLowerCase() ?? "";
    if (
      careersUrl.includes("greenhouse.io") ||
      careersUrl.includes("lever.co") ||
      careersUrl.includes("ashbyhq.com") ||
      careersUrl.includes("workable.com") ||
      careersUrl.includes("smartrecruiters.com") ||
      careersUrl.includes("recruitee.com")
    ) {
      priority += 160;
    } else if (careersUrl) {
      priority += 30;
    }

    return priority;
  }

  async listCandidateBoards() {
    return (this.prisma as any).candidateBoard.findMany({
      include: {
        candidateCompany: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async validateCandidateBoards(input?: { limit?: number; sourceName?: string }) {
    const limit = Math.min(Math.max(input?.limit ?? 25, 1), 500);
    const requestedSource = input?.sourceName?.trim().toLowerCase() as BoardFirstSource | undefined;
    const sourceName = requestedSource && SUPPORTED_ATS_SOURCES.has(requestedSource) ? requestedSource : undefined;
    const boards = await (this.prisma as any).candidateBoard.findMany({
      where: {
        status: "discovered",
        ...(sourceName ? { sourceName } : {}),
      },
      include: {
        candidateCompany: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });

    const results = [];
    const rateLimitedSources = new Set<string>();

    for (const board of boards) {
      const source = board.sourceName as ExternalJobSource;
      const adapter = this.adapters[source];

      if (!adapter) {
        results.push({
          id: board.id,
          boardToken: board.boardToken,
          sourceName: board.sourceName,
          status: "skipped",
          reason: "unsupported_source",
        });
        continue;
      }

      if (rateLimitedSources.has(source)) {
        results.push({
          id: board.id,
          boardToken: board.boardToken,
          sourceName: board.sourceName,
          status: "deferred",
          reason: "source_rate_limited_in_this_batch",
        });
        continue;
      }

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

          await this.updateCandidateCompanyStatusFromBoards(
            board.candidateCompanyId,
            "Board validated but returned no jobs.",
          );

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

          await this.updateCandidateCompanyStatusFromBoards(
            board.candidateCompanyId,
            "Board validated but returned no US jobs.",
          );

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
            ...(board.candidateCompany.status === "promoted" ? {} : { status: "discovered" }),
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

        if (this.isCandidateBoardRateLimit(source, message)) {
          rateLimitedSources.add(source);

          await (this.prisma as any).candidateBoard.update({
            where: { id: board.id },
            data: {
              status: "discovered",
              validationError: `Deferred due to rate limit: ${message}`,
            },
          });

          results.push({
            id: board.id,
            boardToken: board.boardToken,
            sourceName: board.sourceName,
            status: "deferred",
            reason: "rate_limited",
          });
          continue;
        }

        await (this.prisma as any).candidateBoard.update({
          where: { id: board.id },
          data: {
            status: "rejected",
            validationError: message,
            validatedAt: new Date(),
          },
        });

        await this.updateCandidateCompanyStatusFromBoards(board.candidateCompanyId, message);

        results.push({
          id: board.id,
          boardToken: board.boardToken,
          sourceName: board.sourceName,
          status: "rejected",
          reason: message,
        });
      }

      const delayMs = this.candidateBoardValidationDelayMs(source);
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }
    }

    return {
      processed: results.length,
      limit,
      sourceName: sourceName ?? null,
      validated: results.filter((result) => result.status === "validated").length,
      rejected: results.filter((result) => result.status === "rejected").length,
      deferred: results.filter((result) => result.status === "deferred").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      results,
    };
  }

  private candidateBoardValidationDelayMs(source: ExternalJobSource) {
    if (source === "workable" || source === "recruitee") return 1200;
    if (source === "smartrecruiters") return 500;
    return 0;
  }

  private isCandidateBoardRateLimit(source: ExternalJobSource, message: string) {
    const normalized = message.toLowerCase();
    if (source === "workable") {
      return normalized.includes("403") || normalized.includes("429") || normalized.includes("rate");
    }
    if (source === "recruitee" || source === "smartrecruiters") {
      return normalized.includes("429") || normalized.includes("rate");
    }
    return normalized.includes("429") || normalized.includes("rate limit");
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async updateCandidateCompanyStatusFromBoards(
    candidateCompanyId: string,
    lastDiscoveryError: string | null,
  ) {
    const company = await (this.prisma as any).candidateCompany.findUnique({
      where: { id: candidateCompanyId },
      include: {
        candidateBoards: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!company || company.status === "promoted") {
      return;
    }

    const hasActiveBoard = company.candidateBoards.some((board: { status: string }) =>
      ["discovered", "validating", "validated"].includes(board.status),
    );

    await (this.prisma as any).candidateCompany.update({
      where: { id: candidateCompanyId },
      data: {
        status: hasActiveBoard ? "discovered" : "no_supported_board",
        lastDiscoveredAt: new Date(),
        lastDiscoveryError,
      },
    });
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

  async ingestWorkableXmlFeed(input?: WorkableXmlIngestInput) {
    const limit = Math.min(Math.max(input?.limit ?? 1000, 1), 10000);
    const maxRecords = Math.min(Math.max(input?.maxRecords ?? 50000, 100), 500000);
    const freshDays = Math.min(Math.max(input?.freshDays ?? 30, 1), 365);
    const dryRun = input?.dryRun ?? false;
    const cutoff = new Date(Date.now() - freshDays * 24 * 60 * 60 * 1000);
    const dedupeIndex = await this.buildPersistedJobDedupeIndex();
    const stats: WorkableXmlIngestStats = {
      sourceName: WORKABLE_XML_SOURCE_NAME,
      feedUrl: WORKABLE_XML_FEED_URL,
      dryRun,
      limit,
      maxRecords,
      freshDays,
      seen: 0,
      parsed: 0,
      fresh: 0,
      usRelevant: 0,
      targetRole: 0,
      inserted: 0,
      updated: 0,
      persisted: 0,
      skippedOld: 0,
      skippedMissingRequired: 0,
      skippedNonUs: 0,
      skippedNonTarget: 0,
      skippedDuplicate: 0,
      skippedPersistError: 0,
      persistErrors: [],
      stoppedReason: "feed_complete",
    };

    const response = await fetch(WORKABLE_XML_FEED_URL, {
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "AIJobsBot/0.1 (+https://aijobs.local; workable xml ingestion)",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Workable XML feed request failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reachedFeedEnd = false;

    try {
      while (stats.seen < maxRecords && stats.persisted < limit) {
        const { done, value } = await reader.read();
        if (done) {
          reachedFeedEnd = true;
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const shouldStop = await this.consumeWorkableXmlBuffer(buffer, stats, cutoff, limit, dryRun, dedupeIndex);
        buffer = shouldStop.buffer;
        if (shouldStop.done) {
          stats.stoppedReason = "limit_reached";
          break;
        }
      }

      if (stats.seen >= maxRecords && stats.persisted < limit) {
        stats.stoppedReason = "max_records_reached";
      }

      if (stats.stoppedReason === "feed_complete" && buffer.includes("</job>")) {
        await this.consumeWorkableXmlBuffer(buffer, stats, cutoff, limit, dryRun, dedupeIndex);
      }
    } finally {
      if (!reachedFeedEnd) {
        reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }

    return stats;
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

  async getJobRegistryStats() {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const since24h = new Date(now.getTime() - dayMs);
    const since7d = new Date(now.getTime() - 7 * dayMs);
    const since14d = new Date(now.getTime() - 14 * dayMs);
    const since30d = new Date(now.getTime() - 30 * dayMs);
    const since60d = new Date(now.getTime() - 60 * dayMs);

    const [jobStatusCounts, activeJobs, activeBoards, recentJobs] = await Promise.all([
      this.prisma.job.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.job.findMany({
        where: {
          status: JobStatus.active,
        },
        select: {
          sourceName: true,
          boardToken: true,
          title: true,
          company: true,
          location: true,
          remoteType: true,
          postedAt: true,
          createdAt: true,
          lastSyncedAt: true,
        },
      }),
      (this.prisma as any).sourceBoard.findMany({
        where: {
          active: true,
        },
        select: {
          sourceName: true,
          status: true,
          lastCheckedAt: true,
          lastSeenJobCount: true,
          lastTargetJobCount: true,
          totalPersistedJobs: true,
        },
      }),
      this.prisma.job.findMany({
        where: {
          status: JobStatus.active,
        },
        select: {
          sourceKey: true,
          sourceName: true,
          boardToken: true,
          title: true,
          company: true,
          location: true,
          remoteType: true,
          postedAt: true,
          lastSyncedAt: true,
        },
        orderBy: [{ lastSyncedAt: "desc" }, { updatedAt: "desc" }],
        take: 12,
      }),
    ]);

    const statusCounts = Object.fromEntries(
      jobStatusCounts.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    const freshness = {
      synced24h: 0,
      synced7d: 0,
      synced14d: 0,
      synced30d: 0,
      synced60d: 0,
      posted24h: 0,
      posted7d: 0,
      posted14d: 0,
      posted30d: 0,
      posted60d: 0,
      unknownPostedAt: 0,
    };
    const postedAgeBuckets = {
      "0-7 days": 0,
      "8-14 days": 0,
      "15-30 days": 0,
      "31-60 days": 0,
      "60+ days": 0,
      "Unknown posted date": 0,
    };
    const syncAgeBuckets = {
      "0-24 hours": 0,
      "1-7 days": 0,
      "8-14 days": 0,
      "15-30 days": 0,
      "31-60 days": 0,
      "60+ days": 0,
    };
    const bySource = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const byWorkMode = new Map<string, number>();
    const byLocation = new Map<string, number>();
    const byCompany = new Map<string, number>();
    let latestJobSyncAt: Date | null = null;

    for (const job of activeJobs) {
      this.incrementCount(bySource, job.sourceName);
      this.incrementCount(byCategory, this.classifyJobCategory(job.title));
      this.incrementCount(byWorkMode, this.classifyWorkMode(job.remoteType, job.location));
      this.incrementCount(byLocation, this.classifyRegistryLocation(job.location, job.remoteType));
      this.incrementCount(byCompany, job.company);

      if (!latestJobSyncAt || job.lastSyncedAt > latestJobSyncAt) {
        latestJobSyncAt = job.lastSyncedAt;
      }

      if (job.lastSyncedAt >= since24h) freshness.synced24h += 1;
      if (job.lastSyncedAt >= since7d) freshness.synced7d += 1;
      if (job.lastSyncedAt >= since14d) freshness.synced14d += 1;
      if (job.lastSyncedAt >= since30d) freshness.synced30d += 1;
      if (job.lastSyncedAt >= since60d) freshness.synced60d += 1;
      syncAgeBuckets[this.classifySyncAgeBucket(job.lastSyncedAt, now)] += 1;

      if (!job.postedAt) {
        freshness.unknownPostedAt += 1;
        postedAgeBuckets["Unknown posted date"] += 1;
      } else {
        if (job.postedAt >= since24h) freshness.posted24h += 1;
        if (job.postedAt >= since7d) freshness.posted7d += 1;
        if (job.postedAt >= since14d) freshness.posted14d += 1;
        if (job.postedAt >= since30d) freshness.posted30d += 1;
        if (job.postedAt >= since60d) freshness.posted60d += 1;
        postedAgeBuckets[this.classifyPostedAgeBucket(job.postedAt, now)] += 1;
      }
    }

    const boardStatus = new Map<string, number>();
    const boardSource = new Map<string, number>();
    const boardFreshness = {
      neverChecked: 0,
      checked24h: 0,
      checked7d: 0,
      checked14d: 0,
      olderThan14d: 0,
    };
    let latestBoardCheckAt: Date | null = null;

    for (const board of activeBoards) {
      this.incrementCount(boardStatus, board.status);
      this.incrementCount(boardSource, board.sourceName);

      if (!board.lastCheckedAt) {
        boardFreshness.neverChecked += 1;
      } else {
        if (!latestBoardCheckAt || board.lastCheckedAt > latestBoardCheckAt) {
          latestBoardCheckAt = board.lastCheckedAt;
        }

        if (board.lastCheckedAt >= since24h) boardFreshness.checked24h += 1;
        if (board.lastCheckedAt >= since7d) boardFreshness.checked7d += 1;
        if (board.lastCheckedAt >= since14d) boardFreshness.checked14d += 1;
        if (board.lastCheckedAt < since14d) boardFreshness.olderThan14d += 1;
      }
    }

    const latestIncreaseAnchor = latestJobSyncAt ?? latestBoardCheckAt;
    const latestIncreaseSince = latestIncreaseAnchor
      ? new Date(latestIncreaseAnchor.getTime() - 10 * 60 * 1000)
      : null;
    const latestIncreaseBySource = new Map<string, number>();
    let latestIncreaseTotal = 0;

    if (latestIncreaseSince) {
      for (const job of activeJobs) {
        if (job.createdAt >= latestIncreaseSince) {
          latestIncreaseTotal += 1;
          this.incrementCount(latestIncreaseBySource, job.sourceName);
        }
      }
    }

    return {
      generatedAt: now.toISOString(),
      jobs: {
        total: activeJobs.length + (statusCounts.stale ?? 0) + (statusCounts.inactive ?? 0),
        active: activeJobs.length,
        stale: statusCounts.stale ?? 0,
        inactive: statusCounts.inactive ?? 0,
        latestSyncAt: latestJobSyncAt?.toISOString() ?? null,
        latestIncrease: {
          total: latestIncreaseTotal,
          since: latestIncreaseSince?.toISOString() ?? null,
          bySource: this.countMapToRows(latestIncreaseBySource),
        },
        freshness,
        postedAgeBuckets: this.orderedBucketRows(postedAgeBuckets),
        syncAgeBuckets: this.orderedBucketRows(syncAgeBuckets),
        bySource: this.countMapToRows(bySource),
        byCategory: this.countMapToRows(byCategory),
        byWorkMode: this.countMapToRows(byWorkMode),
        byLocation: this.countMapToRows(byLocation),
        topCompanies: this.countMapToRows(byCompany).slice(0, 10),
        recent: recentJobs.map((job) => ({
          sourceKey: job.sourceKey,
          sourceName: job.sourceName,
          boardToken: job.boardToken,
          title: job.title,
          company: job.company,
          location: job.location,
          remoteType: job.remoteType,
          postedAt: job.postedAt?.toISOString() ?? null,
          lastSyncedAt: job.lastSyncedAt.toISOString(),
        })),
      },
      boards: {
        total: activeBoards.length,
        latestCheckedAt: latestBoardCheckAt?.toISOString() ?? null,
        byStatus: this.countMapToRows(boardStatus),
        bySource: this.countMapToRows(boardSource),
        freshness: boardFreshness,
        totalTargetJobsLastRun: activeBoards.reduce(
          (sum: number, board: { lastTargetJobCount: number | null }) => sum + (board.lastTargetJobCount ?? 0),
          0,
        ),
        totalPersistedJobsReported: activeBoards.reduce(
          (sum: number, board: { totalPersistedJobs: number | null }) => sum + (board.totalPersistedJobs ?? 0),
          0,
        ),
      },
    };
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

    const workable = splitCsv(this.configService.get<string>("WORKABLE_ACCOUNT_SUBDOMAINS")).map((boardToken) => ({
      source: "workable" as const,
      boardToken,
    }));

    const smartRecruiters = splitCsv(this.configService.get<string>("SMARTRECRUITERS_COMPANY_IDS")).map((boardToken) => ({
      source: "smartrecruiters" as const,
      boardToken,
    }));

    const recruitee = splitCsv(this.configService.get<string>("RECRUITEE_COMPANY_SUBDOMAINS")).map((boardToken) => ({
      source: "recruitee" as const,
      boardToken,
    }));

    const seeded = getStarterBoards(filterSource);
    const envBoards = [...greenhouse, ...lever, ...ashby, ...workable, ...smartRecruiters, ...recruitee];
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

  private async consumeWorkableXmlBuffer(
    inputBuffer: string,
    stats: WorkableXmlIngestStats,
    cutoff: Date,
    limit: number,
    dryRun: boolean,
    dedupeIndex: PersistedJobDedupeIndex,
  ) {
    let buffer = inputBuffer;

    while (stats.seen < stats.maxRecords && stats.persisted < limit) {
      const startIndex = buffer.indexOf("<job>");
      if (startIndex === -1) {
        if (buffer.length > 2048) {
          buffer = buffer.slice(-2048);
        }
        break;
      }

      const endIndex = buffer.indexOf("</job>", startIndex);
      if (endIndex === -1) {
        buffer = buffer.slice(startIndex);
        break;
      }

      const block = buffer.slice(startIndex, endIndex + "</job>".length);
      buffer = buffer.slice(endIndex + "</job>".length);
      stats.seen += 1;

      await this.processWorkableXmlJob(block, stats, cutoff, dryRun, dedupeIndex);
    }

    return {
      buffer,
      done: stats.persisted >= limit,
    };
  }

  private async processWorkableXmlJob(
    block: string,
    stats: WorkableXmlIngestStats,
    cutoff: Date,
    dryRun: boolean,
    dedupeIndex: PersistedJobDedupeIndex,
  ) {
    const xmlJob = this.parseWorkableXmlJob(block);
    const referenceNumber = xmlJob.referencenumber?.trim();
    const title = xmlJob.title?.trim();
    const company = xmlJob.company?.trim();
    const applyUrl = xmlJob.url?.trim();

    if (!referenceNumber || !title || !company || !applyUrl) {
      stats.skippedMissingRequired += 1;
      return;
    }

    stats.parsed += 1;

    const postedAt = this.toDate(xmlJob.date ?? null);
    if (postedAt && postedAt < cutoff) {
      stats.skippedOld += 1;
      return;
    }
    stats.fresh += 1;

    const location = this.workableXmlLocation(xmlJob);
    const workMode = this.workableXmlRemoteType(xmlJob.remote);
    const filterJob = {
      title,
      location,
      workMode,
    };

    if (!isUsRelevantJob(filterJob)) {
      stats.skippedNonUs += 1;
      return;
    }
    stats.usRelevant += 1;

    if (!isTargetRole(filterJob)) {
      stats.skippedNonTarget += 1;
      return;
    }
    stats.targetRole += 1;

    const sourceKey = `${WORKABLE_XML_SOURCE_NAME}:${referenceNumber}`;
    const duplicate = this.findDuplicatePersistedJob(dedupeIndex, {
      sourceKey,
      sourceId: referenceNumber,
      title,
      company,
      location,
      applyUrl,
    });

    if (duplicate) {
      stats.skippedDuplicate += 1;
      if (!dryRun) {
        try {
          await this.prisma.job.update({
            where: {
              sourceKey: duplicate.sourceKey,
            },
            data: {
              lastSeenAt: new Date(),
              lastSyncedAt: new Date(),
              status: JobStatus.active,
            },
          });
        } catch (error) {
          this.recordWorkableXmlPersistError(stats, {
            sourceKey,
            title,
            company,
            error,
          });
        }
      }
      return;
    }

    if (dryRun) {
      stats.persisted += 1;
      return;
    }

    const description = stripHtml(xmlJob.description) ?? "";
    const companyDomain = this.targetCompanyDomain(company);
    let existing: { id: string } | null;
    try {
      existing = await this.prisma.job.findUnique({
        where: {
          sourceKey,
        },
        select: {
          id: true,
        },
      });

      await this.prisma.job.upsert({
        where: {
          sourceKey,
        },
        create: {
          sourceKey,
          sourceId: referenceNumber,
          sourceName: WORKABLE_XML_SOURCE_NAME,
          boardToken: null,
          title,
          company,
          companyDomain,
          companyLogoUrl: this.logoUrlForDomain(companyDomain),
          location,
          employmentType: null,
          remoteType: workMode,
          description,
          applyUrl,
          postedAt,
          sourceUpdatedAt: postedAt,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
          contentHash: this.workableXmlContentHash({ title, company, location, workMode, description }),
          status: JobStatus.active,
        },
        update: {
          title,
          company,
          companyDomain,
          companyLogoUrl: this.logoUrlForDomain(companyDomain),
          location,
          employmentType: null,
          remoteType: workMode,
          description,
          applyUrl,
          postedAt,
          sourceUpdatedAt: postedAt,
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
          contentHash: this.workableXmlContentHash({ title, company, location, workMode, description }),
          status: JobStatus.active,
          syncCount: { increment: 1 },
        },
      });
    } catch (error) {
      this.recordWorkableXmlPersistError(stats, {
        sourceKey,
        title,
        company,
        error,
      });
      return;
    }

    if (existing) {
      stats.updated += 1;
    } else {
      stats.inserted += 1;
    }
    stats.persisted += 1;
    this.addPersistedJobToDedupeIndex(dedupeIndex, {
      sourceKey,
      sourceId: referenceNumber,
      sourceName: WORKABLE_XML_SOURCE_NAME,
      title,
      company,
      location,
      applyUrl,
    });
  }

  private recordWorkableXmlPersistError(
    stats: WorkableXmlIngestStats,
    input: {
      sourceKey: string;
      title: string;
      company: string;
      error: unknown;
    },
  ) {
    stats.skippedPersistError += 1;
    if (stats.persistErrors.length >= 10) {
      return;
    }

    stats.persistErrors.push({
      sourceKey: input.sourceKey,
      title: input.title,
      company: input.company,
      message: input.error instanceof Error ? input.error.message : "Unknown persistence error",
    });
  }

  private parseWorkableXmlJob(block: string): WorkableXmlJob {
    return {
      title: this.xmlField(block, "title"),
      date: this.xmlField(block, "date"),
      referencenumber: this.xmlField(block, "referencenumber"),
      url: this.xmlField(block, "url"),
      company: this.xmlField(block, "company"),
      city: this.xmlField(block, "city"),
      state: this.xmlField(block, "state"),
      country: this.xmlField(block, "country"),
      remote: this.xmlField(block, "remote"),
      description: this.xmlField(block, "description"),
    };
  }

  private xmlField(block: string, field: keyof WorkableXmlJob) {
    const match = block.match(new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, "i"));
    return match ? this.decodeXmlValue(match[1]) : null;
  }

  private decodeXmlValue(value: string) {
    const trimmed = value.trim();
    const cdata = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    return (cdata ? cdata[1] : trimmed)
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private workableXmlLocation(job: WorkableXmlJob) {
    const country = this.normalizeWorkableXmlCountry(job.country);
    return [job.city, job.state, country].map((part) => part?.trim()).filter(Boolean).join(", ");
  }

  private normalizeWorkableXmlCountry(country?: string | null) {
    const normalized = country?.trim();
    if (!normalized) return null;
    if (/^(us|usa|u\.s\.|u\.s\.a\.)$/i.test(normalized)) {
      return "United States";
    }
    if (/^(uk|gb|gbr)$/i.test(normalized)) {
      return "United Kingdom";
    }
    return normalized;
  }

  private workableXmlRemoteType(remote?: string | null) {
    const normalized = remote?.trim().toLowerCase();
    if (!normalized) return null;
    return ["true", "1", "yes", "remote"].includes(normalized) ? "remote" : null;
  }

  private workableXmlContentHash(job: {
    title: string;
    company: string;
    location: string;
    workMode: string | null;
    description: string;
  }) {
    return [job.title, job.company, job.location, job.workMode, job.description]
      .filter(Boolean)
      .join("|");
  }

  private async buildPersistedJobDedupeIndex(): Promise<PersistedJobDedupeIndex> {
    const rows = await this.prisma.job.findMany({
      where: {
        status: JobStatus.active,
      },
      select: {
        sourceKey: true,
        sourceId: true,
        sourceName: true,
        title: true,
        company: true,
        location: true,
        applyUrl: true,
      },
    });

    const index: PersistedJobDedupeIndex = {
      bySourceKey: new Map(),
      byApplyUrl: new Map(),
      byWorkableId: new Map(),
      byCompanyTitle: new Map(),
    };

    for (const row of rows) {
      this.addPersistedJobToDedupeIndex(index, row);
    }

    return index;
  }

  private addPersistedJobToDedupeIndex(
    index: PersistedJobDedupeIndex,
    row: PersistedJobDedupeRow,
  ) {
    index.bySourceKey.set(row.sourceKey, row);

    const applyUrl = this.normalizeUrl(row.applyUrl);
    if (applyUrl) {
      index.byApplyUrl.set(applyUrl, row);
    }

    const workableId = this.workableJobIdFromPersistedJob(row);
    if (workableId) {
      index.byWorkableId.set(workableId, row);
    }

    const companyTitleKey = this.companyTitleDedupeKey(row.company, row.title);
    const companyTitleRows = index.byCompanyTitle.get(companyTitleKey) ?? [];
    companyTitleRows.push(row);
    index.byCompanyTitle.set(companyTitleKey, companyTitleRows);
  }

  private findDuplicatePersistedJob(index: PersistedJobDedupeIndex, input: {
    sourceKey: string;
    sourceId: string;
    title: string;
    company: string;
    location: string;
    applyUrl: string;
  }) {
    const exactSourceKey = index.bySourceKey.get(input.sourceKey);
    if (exactSourceKey) return exactSourceKey;

    const exactApplyUrl = index.byApplyUrl.get(this.normalizeUrl(input.applyUrl));
    if (exactApplyUrl) return exactApplyUrl;

    const sameWorkableId = index.byWorkableId.get(input.sourceId);
    if (sameWorkableId) return sameWorkableId;

    const candidates = index.byCompanyTitle.get(this.companyTitleDedupeKey(input.company, input.title)) ?? [];
    return candidates.find((candidate) =>
      this.locationsCompatibleForDedupe(candidate.location, input.location),
    ) ?? null;
  }

  private companyTitleDedupeKey(company: string, title: string) {
    return `${this.normalizeJobDedupeText(company)}:${this.normalizeJobDedupeText(title)}`;
  }

  private workableJobIdFromPersistedJob(row: PersistedJobDedupeRow) {
    if (![WORKABLE_XML_SOURCE_NAME, "workable"].includes(row.sourceName)) {
      return null;
    }

    if (row.sourceId) {
      return row.sourceId;
    }

    const sourceKeyParts = row.sourceKey.split(":");
    return sourceKeyParts.length >= 3 ? sourceKeyParts[sourceKeyParts.length - 1] : null;
  }

  private normalizeJobDedupeText(value?: string | null) {
    return (value ?? "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private locationsCompatibleForDedupe(left?: string | null, right?: string | null) {
    const leftSignal = this.locationDedupeSignal(left);
    const rightSignal = this.locationDedupeSignal(right);

    if (!leftSignal || !rightSignal) return true;
    if (leftSignal === rightSignal) return true;
    if (leftSignal === "remote-us" && rightSignal === "us") return true;
    if (leftSignal === "us" && rightSignal === "remote-us") return true;

    return false;
  }

  private locationDedupeSignal(value?: string | null) {
    const normalized = (value ?? "").toLowerCase();
    if (!normalized.trim()) return null;
    const isRemote = /\bremote\b/.test(normalized);
    const isUs =
      /\bunited states\b|\busa\b|\bu\.s\.\b|\bus\b/.test(normalized) ||
      /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/.test(normalized);

    if (isRemote && isUs) return "remote-us";
    if (isUs) return "us";
    if (isRemote) return "remote";

    return normalized
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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

    if (this.openaiCompanyEnrichmentEnabled && this.openaiClient && !sourceHint && !careersUrl) {
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
      enrichmentSource: sourceHint || careersUrl ? "scrape-only" : "scrape-only:no-llm",
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
        const url = new URL(href, baseUrl);
        if (!this.isLikelyCareersPageUrl(url)) {
          continue;
        }

        return url.toString();
      } catch {
        continue;
      }
    }

    return null;
  }

  private isLikelyCareersPageUrl(url: URL) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const pathname = url.pathname.toLowerCase();
    if (!/(careers?|jobs?|open-roles?|positions?|join-us)/i.test(pathname)) {
      return false;
    }

    return !/\.(?:avif|bmp|css|gif|ico|jpeg|jpg|js|map|mp4|pdf|png|svg|webp|woff2?)$/i.test(pathname);
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
  "sourceHint": "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "recruitee" | null,
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
      workable: [
        "Search for direct Workable hosted careers pages using evidence like site:apply.workable.com.",
        "Prefer apply.workable.com/<company> board roots and avoid guessed company slugs.",
      ],
      smartrecruiters: [
        "Search for direct SmartRecruiters career pages using evidence like site:careers.smartrecruiters.com or site:jobs.smartrecruiters.com.",
        "Use the company identifier visible in the SmartRecruiters URL.",
      ],
      recruitee: [
        "Search for direct Recruitee career pages using evidence like site:recruitee.com/o/ or company.recruitee.com.",
        "Use the company subdomain from <company>.recruitee.com.",
      ],
    };

    const sourcePatterns: Record<Exclude<ExternalJobSource, "adzuna">, string> = {
      greenhouse: "https://boards.greenhouse.io/<token> or https://job-boards.greenhouse.io/<token>",
      lever: "https://jobs.lever.co/<token>",
      ashby: "https://jobs.ashbyhq.com/<token>",
      workable: "https://apply.workable.com/<token>",
      smartrecruiters: "https://careers.smartrecruiters.com/<token>",
      recruitee: "https://<token>.recruitee.com",
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

  private resolveBoardFirstSources(customQuery?: string): BoardFirstSource[] {
    const text = customQuery?.toLowerCase() ?? "";
    if (!text.trim()) {
      return [...BOARD_FIRST_SOURCES];
    }

    const aliases: Record<BoardFirstSource, string[]> = {
      greenhouse: ["greenhouse", "boards.greenhouse.io", "job-boards.greenhouse.io"],
      lever: ["lever", "jobs.lever.co"],
      ashby: ["ashby", "ashbyhq", "jobs.ashbyhq.com"],
      workable: ["workable", "apply.workable.com"],
      smartrecruiters: ["smartrecruiters", "smart recruiters", "careers.smartrecruiters.com", "jobs.smartrecruiters.com"],
      recruitee: ["recruitee"],
    };

    const explicitIncludes = BOARD_FIRST_SOURCES.filter((source) =>
      aliases[source].some((alias) => text.includes(alias)),
    );
    let selected = explicitIncludes.length ? explicitIncludes : [...BOARD_FIRST_SOURCES];
    const exclusionClauses = text.match(/(?:exclude|excluding|without|skip|omit)[^.;&\n]+/g) ?? [];

    selected = selected.filter((source) => {
      const denied = aliases[source].some((alias) => {
        const compactAlias = alias.replace(/\s+/g, "");
        return (
          exclusionClauses.some((clause) => clause.includes(alias) || clause.includes(compactAlias)) ||
          text.includes(`not ${alias}`)
        );
      });

      return !denied;
    });

    return selected.length ? selected : [...BOARD_FIRST_SOURCES];
  }

  private distributeBoardSourceLimit(limit: number, sources: BoardFirstSource[] = BOARD_FIRST_SOURCES) {
    const selectedSources = sources.length ? sources : BOARD_FIRST_SOURCES;
    const perSource = Math.floor(limit / selectedSources.length);
    let remainder = limit % selectedSources.length;

    const limits = BOARD_FIRST_SOURCES.reduce(
      (acc, source) => {
        acc[source] = 0;
        return acc;
      },
      {} as Record<BoardFirstSource, number>,
    );

    for (const source of selectedSources) {
      limits[source] = perSource + (remainder > 0 ? 1 : 0);
      if (remainder > 0) {
        remainder -= 1;
      }
    }

    return limits;
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
      workable: ["apply.workable.com"],
      smartrecruiters: ["careers.smartrecruiters.com", "jobs.smartrecruiters.com"],
      recruitee: ["recruitee.com"],
    };

    const focusTermsByArea: Record<string, string[]> = {
      "software engineering": [
        "software engineer",
        "software developer",
        "full stack developer",
        "backend engineer",
        "frontend engineer",
        "java developer",
        "python developer",
        ".net developer",
        "react developer",
        "mobile developer",
        "android developer",
        "ios developer",
      ],
      data: [
        "data engineer",
        "data analyst",
        "business intelligence analyst",
        "bi developer",
        "analytics engineer",
        "data scientist",
        "machine learning engineer",
        "etl developer",
        "data warehouse developer",
        "sql developer",
      ],
      product: [
        "product manager",
        "product owner",
        "technical product manager",
        "technical program manager",
        "project manager",
        "scrum master",
      ],
      design: [
        "product designer",
        "ux designer",
        "ui designer",
        "ux researcher",
        "design engineer",
      ],
      qa: [
        "qa engineer",
        "qa analyst",
        "quality assurance engineer",
        "sdet",
        "automation engineer",
        "test engineer",
        "software test engineer",
      ],
      "cloud infrastructure": [
        "devops engineer",
        "cloud engineer",
        "aws engineer",
        "azure engineer",
        "infrastructure engineer",
        "platform engineer",
        "site reliability engineer",
        "sre",
        "kubernetes engineer",
        "linux engineer",
      ],
      security: [
        "security engineer",
        "cybersecurity analyst",
        "information security analyst",
        "application security engineer",
        "cloud security engineer",
        "soc analyst",
        "grc analyst",
      ],
      "it support": [
        "systems engineer",
        "systems administrator",
        "network engineer",
        "it support engineer",
        "technical support engineer",
        "application support engineer",
        "production support engineer",
        "desktop support",
        "help desk",
      ],
      "business systems": [
        "business analyst",
        "systems analyst",
        "implementation consultant",
        "solutions consultant",
        "solutions engineer",
        "integration engineer",
      ],
      "erp crm": [
        "salesforce developer",
        "salesforce administrator",
        "servicenow developer",
        "servicenow administrator",
        "sap consultant",
        "oracle developer",
        "workday analyst",
        "erp analyst",
        "crm analyst",
      ],
    };

    const focusTerms = Array.from(
      new Set(
        input.focusAreas.flatMap((area) => focusTermsByArea[area.toLowerCase()] ?? [area.toLowerCase()]),
      ),
    ).slice(0, 72);

    const usClause = '"United States" OR "Remote US" OR "Remote, US" OR USA OR "New York" OR "San Francisco"';
    const roleGroups = this.chunkSearchTerms(focusTerms, 4);

    return hostsBySource[input.source].flatMap((host) => {
      const queries = roleGroups.flatMap((group) => {
        const roleClause = group.map((term) => `"${term}"`).join(" OR ");
        return [
          `site:${host} (${roleClause}) (${usClause})`,
          `site:${host} jobs (${roleClause})`,
          `site:${host} careers (${roleClause}) (${usClause})`,
        ];
      });

      queries.push(
        `site:${host} ${input.source} board`,
      );

      if (input.customQuery?.trim()) {
        queries.push(`site:${host} ${input.customQuery.trim()}`);
      }

      return queries;
    });
  }

  private chunkSearchTerms(terms: string[], size: number) {
    const chunks: string[][] = [];

    for (let index = 0; index < terms.length; index += size) {
      chunks.push(terms.slice(index, index + size));
    }

    return chunks.length ? chunks : [["software engineer", "data engineer", "qa engineer", "product manager"]];
  }

  private async harvestDirectBoardCandidates(input: {
    limit: number;
    sources: BoardFirstSource[];
    limitsBySource: Record<BoardFirstSource, number>;
    focusAreas: string[];
    customQuery?: string;
  }) {
    const maxPagesPerQuery = 5;

    return Promise.all(
      input.sources.map(async (source) => {
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

        if (this.openaiBoardFallbackEnabled && this.openaiClient && candidates.length < targetCandidates) {
          const fallbackTarget = Math.min(targetCandidates, Math.max(requested * 2, 40));
          const fallbackQueries = this.buildBoardSourceFallbackQueries({
            source,
            focusAreas: input.focusAreas,
            customQuery: input.customQuery,
            directQueries: queries,
          });

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
                  evidenceKind: board.evidenceKind,
                  evidenceSource: board.evidenceSource,
                }),
              )
              .filter((candidate): candidate is CandidateBoardInput => Boolean(candidate))
              .filter((candidate) => this.shouldKeepFallbackBoardCandidate(candidate))
              .sort((left, right) => this.compareBoardCandidateEvidence(left, right));

            for (const candidate of pageCandidates) {
              const key = `${candidate.source}:${candidate.boardToken}`;
              if (seenKeys.has(key)) {
                continue;
              }

              seenKeys.add(key);
              candidates.push(candidate);

              if (candidates.length >= fallbackTarget) {
                break;
              }
            }

            if (candidates.length >= fallbackTarget) {
              break;
            }
          }
        }

        return {
          source,
          candidates,
          queriesTried,
          pagesFetched,
          searchBlocked: directSearchBlocked,
        };
      }),
    );
  }

  private async harvestBackfillBoardCandidates(input: {
    round: number;
    sources: BoardFirstSource[];
    limitsBySource: Record<BoardFirstSource, number>;
    focusAreas: string[];
    customQuery?: string;
    knownCandidates: CandidateBoardInput[];
    keptCandidates: CandidateBoardInput[];
  }) {
    return Promise.all(
      input.sources.map(async (source) => {
        const requested = input.limitsBySource[source];
        const keptForSource = input.keptCandidates.filter((candidate) => candidate.source === source).length;
        const needed = Math.max(requested - keptForSource, 0);

        if (needed === 0) {
          return {
            source,
            candidates: [] as CandidateBoardInput[],
            queriesTried: 0,
            pagesFetched: 0,
          };
        }

        const seenKeys = new Set(
          input.knownCandidates.map((candidate) => `${candidate.source}:${candidate.boardToken.toLowerCase()}`),
        );
        const avoidTokens = input.knownCandidates
          .filter((candidate) => candidate.source === source)
          .map((candidate) => candidate.boardToken)
          .slice(-60);
        const candidates: CandidateBoardInput[] = [];
        const targetCandidates = Math.min(Math.max(needed * 4, 30), 120);
        const queries = this.buildBoardSourceBackfillQueries({
          source,
          focusAreas: input.focusAreas,
          customQuery: input.customQuery,
          avoidTokens,
          round: input.round,
        });
        let queriesTried = 0;

        for (const query of queries) {
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
                evidenceKind: board.evidenceKind,
                evidenceSource: board.evidenceSource,
              }),
            )
            .filter((candidate): candidate is CandidateBoardInput => Boolean(candidate))
            .filter((candidate) => this.shouldKeepFallbackBoardCandidate(candidate))
            .sort((left, right) => this.compareBoardCandidateEvidence(left, right));

          for (const candidate of pageCandidates) {
            const key = `${candidate.source}:${candidate.boardToken.toLowerCase()}`;
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

        return {
          source,
          candidates,
          queriesTried,
          pagesFetched: 0,
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

  private uniqueBoardCandidates(candidates: CandidateBoardInput[]) {
    const seenKeys = new Set<string>();
    const unique: CandidateBoardInput[] = [];

    for (const candidate of candidates) {
      const key = `${candidate.source}:${candidate.boardToken.toLowerCase()}`;
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      unique.push(candidate);
    }

    return unique;
  }

  private buildBoardSourceFallbackQueries(input: {
    source: Exclude<ExternalJobSource, "adzuna">;
    focusAreas: string[];
    customQuery?: string;
    directQueries: string[];
  }) {
    const roleFamilies = input.focusAreas.join(", ");
    const sourcePrompts: Record<Exclude<ExternalJobSource, "adzuna">, string[]> = {
      greenhouse: [
        `Find real Greenhouse company job board URLs on boards.greenhouse.io or job-boards.greenhouse.io for US companies hiring in ${roleFamilies}.`,
        `Find Greenhouse job posting URLs on job-boards.greenhouse.io with United States or Remote US jobs in software, data, product, QA, cloud, security, and IT roles.`,
        `Find boards.greenhouse.io/embed/job_board?for= company board URLs for technology companies with US jobs.`,
        `Find Greenhouse boards for AI, SaaS, fintech, devtools, healthcare technology, security, data, and infrastructure companies hiring in the US.`,
      ],
      lever: [
        `Find current Lever job posting URLs on jobs.lever.co with United States or Remote US jobs in software, data, product, QA, cloud, security, and IT roles.`,
        `Find jobs.lever.co URLs with at least two path segments, like jobs.lever.co/<company>/<posting-id-or-slug>, for AI, SaaS, fintech, devtools, healthcare technology, security, data, and infrastructure companies hiring in the US.`,
        `Find direct Lever posting URLs that appeared verbatim in search results for US-based technology roles. Exclude board-root-only URLs like jobs.lever.co/<company>.`,
      ],
      ashby: [
        `Find real Ashby company job board URLs that appear verbatim on jobs.ashbyhq.com for US companies hiring in ${roleFamilies}.`,
        `Find current Ashby job posting URLs on jobs.ashbyhq.com with United States or Remote US jobs in software, data, product, QA, cloud, security, and IT roles.`,
        `Find jobs.ashbyhq.com company boards for AI, SaaS, fintech, devtools, healthcare technology, security, data, and infrastructure companies hiring in the US. Do not guess a board URL from a company name.`,
      ],
      workable: [
        `Find real Workable hosted career pages on apply.workable.com for US companies hiring in ${roleFamilies}.`,
        `Find Workable job pages or company boards for SaaS, AI, fintech, healthcare technology, security, data, and infrastructure companies with US jobs.`,
      ],
      smartrecruiters: [
        `Find real SmartRecruiters company career pages on careers.smartrecruiters.com for US companies hiring in ${roleFamilies}.`,
        `Find jobs.smartrecruiters.com posting URLs for software, data, product, QA, cloud, security, and IT roles in the US.`,
      ],
      recruitee: [
        `Find real Recruitee career sites on <company>.recruitee.com for US companies hiring in ${roleFamilies}.`,
        `Find Recruitee /o/ job posting URLs for software, data, product, QA, cloud, security, and IT roles in the US.`,
      ],
    };
    const sampledDirectQueries = this.sampleSearchQueries(input.directQueries, 8);
    const customQuery = input.customQuery?.trim()
      ? [`Find ${input.source} job board URLs related to: ${input.customQuery.trim()}`]
      : [];

    return Array.from(
      new Set([...customQuery, ...sourcePrompts[input.source], ...sampledDirectQueries]),
    ).slice(0, 12);
  }

  private buildBoardSourceBackfillQueries(input: {
    source: Exclude<ExternalJobSource, "adzuna">;
    focusAreas: string[];
    customQuery?: string;
    avoidTokens: string[];
    round: number;
  }) {
    const roleFamilies = input.focusAreas.join(", ");
    const avoidClause = input.avoidTokens.length
      ? `Avoid these already-seen board tokens: ${input.avoidTokens.join(", ")}.`
      : "Avoid duplicates from earlier results.";
    const sourcePrompts: Record<Exclude<ExternalJobSource, "adzuna">, string[]> = {
      greenhouse: [
        `Backfill more real Greenhouse job board or posting URLs for US technology companies hiring in ${roleFamilies}. ${avoidClause}`,
        `Find additional job-boards.greenhouse.io posting URLs or company boards for US software, data, product, QA, cloud, security, and IT roles. ${avoidClause}`,
      ],
      lever: [
        `Backfill more real Lever posting URLs with at least two path segments on jobs.lever.co for US technology roles. ${avoidClause}`,
        `Find additional current jobs.lever.co/<company>/<posting-id-or-slug> URLs for software, data, product, QA, cloud, security, and IT roles in the US. ${avoidClause}`,
      ],
      ashby: [
        `Backfill more real Ashby job board or posting URLs on jobs.ashbyhq.com for US technology companies hiring in ${roleFamilies}. ${avoidClause}`,
        `Find additional jobs.ashbyhq.com company boards or posting URLs for software, data, product, QA, cloud, security, and IT roles in the US. ${avoidClause}`,
      ],
      workable: [
        `Backfill more real Workable career pages on apply.workable.com for US technology companies hiring in ${roleFamilies}. ${avoidClause}`,
        `Find additional Workable job or company URLs for software, data, product, QA, cloud, security, and IT roles in the US. ${avoidClause}`,
      ],
      smartrecruiters: [
        `Backfill more real SmartRecruiters career pages on careers.smartrecruiters.com for US technology companies hiring in ${roleFamilies}. ${avoidClause}`,
        `Find additional jobs.smartrecruiters.com posting URLs for software, data, product, QA, cloud, security, and IT roles in the US. ${avoidClause}`,
      ],
      recruitee: [
        `Backfill more real Recruitee career sites on company.recruitee.com for US technology companies hiring in ${roleFamilies}. ${avoidClause}`,
        `Find additional Recruitee /o/ posting URLs for software, data, product, QA, cloud, security, and IT roles in the US. ${avoidClause}`,
      ],
    };
    const customQuery = input.customQuery?.trim()
      ? [`Backfill ${input.source} ATS URLs related to "${input.customQuery.trim()}". ${avoidClause}`]
      : [];
    const roundPrompt =
      input.round > 1
        ? [`Find less obvious but still real ${input.source} ATS URLs from mid-market and growth-stage companies. ${avoidClause}`]
        : [];

    return Array.from(
      new Set([...customQuery, ...sourcePrompts[input.source], ...roundPrompt]),
    );
  }

  private sampleSearchQueries(queries: string[], limit: number) {
    if (queries.length <= limit) {
      return queries;
    }

    const selected: string[] = [];
    const lastIndex = queries.length - 1;

    for (let index = 0; index < limit; index += 1) {
      selected.push(queries[Math.round((index / (limit - 1)) * lastIndex)]);
    }

    return Array.from(new Set(selected));
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
                  "Find public hosted ATS job board and job posting URLs only.",
                  `Target ATS source: ${input.source}.`,
                  "Prioritize companies hiring in the United States or remote US.",
                  "Prefer company-level board URLs, then direct job posting URLs, on the requested ATS host.",
                  "Only include URLs that appeared verbatim in web search results.",
                  "Do not construct, infer, or guess an ATS URL from a company name.",
                  "Do not include placeholders like company-a, company-b, example, sample, or test.",
                  "If you are unsure whether the exact URL exists, omit it.",
                  "Return a newline-separated list of up to 50 URLs. Do not include prose.",
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

      const urls = new Map<string, SourceUrlEvidence>();
      for (const url of this.extractWebSearchSourceUrls(response)) {
        urls.set(url, {
          url,
          evidenceSource: "openai_citation",
        });
      }

      for (const url of this.extractUrlsFromText(this.extractResponseText(response))) {
        if (!urls.has(url)) {
          urls.set(url, {
            url,
            evidenceSource: "openai_text",
          });
        }
      }

      return Array.from(urls.values());
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
          return extractBoardsFromText(text, text)
            .filter((candidate) => candidate.source === source)
            .map((candidate) => this.withBoardEvidence(candidate, "direct_search"));
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
          evidenceKind: board.evidenceKind,
          evidenceSource: board.evidenceSource,
        }),
      )
      .filter((candidate): candidate is CandidateBoardInput => Boolean(candidate));
  }

  private extractBoardCandidatesFromSourceUrls(
    sourceUrls: Array<string | SourceUrlEvidence>,
    source: Exclude<ExternalJobSource, "adzuna">,
  ) {
    return sourceUrls.flatMap((sourceUrl) => {
      const evidence =
        typeof sourceUrl === "string"
          ? {
              url: sourceUrl,
              evidenceSource: "direct_search" as const,
            }
          : sourceUrl;

      try {
        return extractBoardsFromText(evidence.url, evidence.url)
          .filter((candidate) => candidate.source === source)
          .map((candidate) => this.withBoardEvidence(candidate, evidence.evidenceSource));
      } catch {
        return [];
      }
    });
  }

  private withBoardEvidence(
    candidate: Pick<CandidateBoardInput, "source" | "boardToken" | "evidenceUrl">,
    evidenceSource: CandidateEvidenceSource,
  ): CandidateBoardInput {
    return {
      ...candidate,
      evidenceKind: this.classifyBoardEvidence(candidate.source, candidate.evidenceUrl),
      evidenceSource,
    };
  }

  private classifyBoardEvidence(source: ExternalJobSource, evidenceUrl: string): CandidateEvidenceKind {
    try {
      const parsed = new URL(evidenceUrl.replace(/&amp;/g, "&"));
      const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      const segments = parsed.pathname.split("/").filter(Boolean);

      if (
        (source === "greenhouse" && hostname === "boards-api.greenhouse.io") ||
        (source === "lever" && hostname === "api.lever.co") ||
        (source === "ashby" && hostname === "api.ashbyhq.com") ||
        (source === "workable" && hostname === "www.workable.com") ||
        (source === "smartrecruiters" && hostname === "api.smartrecruiters.com")
      ) {
        return "api_url";
      }

      if (source === "greenhouse") {
        if (hostname === "job-boards.greenhouse.io") {
          return segments.length > 2 && segments[1] === "jobs" ? "job_posting_url" : "board_root_url";
        }

        if (hostname === "boards.greenhouse.io") {
          return segments[0] === "embed" && parsed.searchParams.has("token")
            ? "job_posting_url"
            : "board_root_url";
        }
      }

      if (source === "lever" && hostname === "jobs.lever.co") {
        return segments.length > 1 ? "job_posting_url" : "board_root_url";
      }

      if (source === "ashby" && hostname === "jobs.ashbyhq.com") {
        return segments.length > 1 ? "job_posting_url" : "board_root_url";
      }

      if (source === "workable" && hostname === "apply.workable.com") {
        return segments.length > 2 || segments[0] === "j" ? "job_posting_url" : "board_root_url";
      }

      if (source === "smartrecruiters") {
        if (hostname === "jobs.smartrecruiters.com") {
          return segments.length > 1 ? "job_posting_url" : "board_root_url";
        }
        if (hostname === "careers.smartrecruiters.com") {
          return "board_root_url";
        }
      }

      if (source === "recruitee" && hostname.endsWith(".recruitee.com")) {
        return segments[0] === "o" && segments.length > 1 ? "job_posting_url" : "board_root_url";
      }
    } catch {
      return "unknown";
    }

    return "unknown";
  }

  private shouldKeepFallbackBoardCandidate(candidate: CandidateBoardInput) {
    if (candidate.source === "lever" && candidate.evidenceKind === "board_root_url") {
      return false;
    }

    if (
      (candidate.source === "lever" || candidate.source === "ashby") &&
      candidate.evidenceSource === "openai_text" &&
      candidate.evidenceKind === "board_root_url"
    ) {
      return false;
    }

    return true;
  }

  private compareBoardCandidateEvidence(left: CandidateBoardInput, right: CandidateBoardInput) {
    return this.boardCandidateEvidenceScore(right) - this.boardCandidateEvidenceScore(left);
  }

  private boardCandidateEvidenceScore(candidate: CandidateBoardInput) {
    const kindScore: Record<CandidateEvidenceKind, number> = {
      api_url: 4,
      job_posting_url: 3,
      board_root_url: 1,
      unknown: 0,
    };
    const sourceScore: Record<CandidateEvidenceSource, number> = {
      direct_search: 3,
      openai_citation: 2,
      openai_text: 0,
    };

    return (kindScore[candidate.evidenceKind ?? "unknown"] * 10) + sourceScore[candidate.evidenceSource ?? "openai_text"];
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

  private extractUrlsFromText(text: string) {
    const urls = new Set<string>();

    for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) {
      const url = match[0]?.replace(/&amp;/g, "&").replace(/[.,;:]+$/, "");
      if (url) {
        urls.add(url);
      }
    }

    return Array.from(urls);
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

  private normalizeBoardCandidate(candidate: CandidateBoardInput): CandidateBoardInput | null {
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
      evidenceKind: candidate.evidenceKind ?? this.classifyBoardEvidence(candidate.source, candidate.evidenceUrl),
      evidenceSource: candidate.evidenceSource,
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
      workable: `https://apply.workable.com/${boardToken}`,
      smartrecruiters: `https://careers.smartrecruiters.com/${boardToken}`,
      recruitee: `https://${boardToken}.recruitee.com`,
    };

    try {
      if (evidenceUrl) {
        const parsed = new URL(evidenceUrl);
        const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();

        if (
          (source === "greenhouse" &&
            (hostname === "job-boards.greenhouse.io" || hostname === "boards.greenhouse.io")) ||
          (source === "lever" && hostname === "jobs.lever.co") ||
          (source === "ashby" && hostname === "jobs.ashbyhq.com") ||
          (source === "workable" && hostname === "apply.workable.com") ||
          (source === "smartrecruiters" &&
            (hostname === "careers.smartrecruiters.com" || hostname === "jobs.smartrecruiters.com")) ||
          (source === "recruitee" && hostname.endsWith(".recruitee.com"))
        ) {
          return source === "recruitee"
            ? `https://${boardToken}.recruitee.com`
            : `${parsed.protocol}//${parsed.hostname}/${boardToken}`;
        }
      }
    } catch {
      return fallbackBySource[source as Exclude<ExternalJobSource, "adzuna">];
    }

    return fallbackBySource[source as Exclude<ExternalJobSource, "adzuna">];
  }

  private async filterNewBoardCandidates(candidates: CandidateBoardInput[]) {
    const rejectedAfter = new Date(Date.now() - BOARD_REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const [existingCandidateBoards, existingSourceBoards] = await Promise.all([
      (this.prisma as any).candidateBoard.findMany({
        where: {
          OR: [
            {
              status: {
                in: ["discovered", "validating", "validated"],
              },
            },
            {
              status: "rejected",
              updatedAt: {
                gte: rejectedAfter,
              },
            },
          ],
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
      "apply.workable.com",
      "www.workable.com",
      "careers.smartrecruiters.com",
      "jobs.smartrecruiters.com",
      "api.smartrecruiters.com",
      "recruitee.com",
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

  private incrementCount(map: Map<string, number>, key: string | null | undefined) {
    const normalized = key?.trim() || "Unknown";
    map.set(normalized, (map.get(normalized) ?? 0) + 1);
  }

  private orderedBucketRows<TBucket extends string>(buckets: Record<TBucket, number>) {
    return Object.entries(buckets).map(([label, count]) => ({
      label,
      count: count as number,
    }));
  }

  private countMapToRows(map: Map<string, number>) {
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }

  private classifyPostedAgeBucket(postedAt: Date, now: Date) {
    const ageDays = this.ageInDays(postedAt, now);

    if (ageDays <= 7) return "0-7 days" as const;
    if (ageDays <= 14) return "8-14 days" as const;
    if (ageDays <= 30) return "15-30 days" as const;
    if (ageDays <= 60) return "31-60 days" as const;
    return "60+ days" as const;
  }

  private classifySyncAgeBucket(syncedAt: Date, now: Date) {
    const ageDays = this.ageInDays(syncedAt, now);

    if (ageDays < 1) return "0-24 hours" as const;
    if (ageDays <= 7) return "1-7 days" as const;
    if (ageDays <= 14) return "8-14 days" as const;
    if (ageDays <= 30) return "15-30 days" as const;
    if (ageDays <= 60) return "31-60 days" as const;
    return "60+ days" as const;
  }

  private ageInDays(value: Date, now: Date) {
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.max(0, (now.getTime() - value.getTime()) / dayMs);
  }

  private classifyJobCategory(title: string) {
    const normalized = title.toLowerCase();

    if (/\b(machine learning|ml engineer|ai engineer|artificial intelligence|llm|nlp|computer vision)\b/.test(normalized)) {
      return "AI / ML";
    }
    if (/\b(data engineer|data scientist|analytics engineer|business intelligence|bi\b|data analyst|analytics|etl|warehouse)\b/.test(normalized)) {
      return "Data";
    }
    if (/\b(product manager|product owner|group product|principal product|technical product)\b/.test(normalized)) {
      return "Product";
    }
    if (/\b(qa|quality assurance|sdet|test automation|software development engineer in test)\b/.test(normalized)) {
      return "QA / Test";
    }
    if (/\b(security|cybersecurity|appsec|application security|trust and safety|iam|identity)\b/.test(normalized)) {
      return "Security";
    }
    if (/\b(devops|sre|site reliability|cloud|infrastructure|platform engineer|systems engineer|kubernetes)\b/.test(normalized)) {
      return "Cloud / Infrastructure";
    }
    if (/\b(ux|ui|product design|designer|researcher)\b/.test(normalized)) {
      return "Design";
    }
    if (/\b(salesforce|servicenow|erp|crm|business systems|netsuite|workday analyst|systems analyst)\b/.test(normalized)) {
      return "Business Systems";
    }
    if (/\b(it support|help desk|desktop support|technical support|support engineer|support specialist)\b/.test(normalized)) {
      return "IT / Support";
    }
    if (/\b(program manager|project manager|scrum master|delivery manager|tpm|technical program)\b/.test(normalized)) {
      return "Program / Delivery";
    }
    if (/\b(software|engineer|developer|frontend|front end|backend|back end|full stack|mobile|ios|android)\b/.test(normalized)) {
      return "Software Engineering";
    }

    return "Other";
  }

  private classifyWorkMode(remoteType?: string | null, location?: string | null) {
    const combined = `${remoteType ?? ""} ${location ?? ""}`.toLowerCase();

    if (/\b(remote|work from home|wfh)\b/.test(combined)) return "Remote";
    if (/\bhybrid\b/.test(combined)) return "Hybrid";
    if (/\bonsite|on-site|office\b/.test(combined)) return "Onsite";
    return "Unknown";
  }

  private classifyRegistryLocation(location?: string | null, remoteType?: string | null) {
    const combined = `${location ?? ""} ${remoteType ?? ""}`.toLowerCase();

    if (!combined.trim()) return "Unknown";
    if (combined.includes("remote") && /\b(us|usa|united states|u\.s\.|north america)\b/.test(combined)) {
      return "Remote US / North America";
    }
    if (/\b(united states|usa|u\.s\.| us |new york|san francisco|california|texas|florida|washington|chicago|boston|austin|seattle|denver|atlanta|remote, us)\b/.test(` ${combined} `)) {
      return "US";
    }
    if (/\bcanada|north america\b/.test(combined)) {
      return "North America";
    }
    if (combined.includes("remote")) return "Remote, location unclear";
    return "Other / Global";
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
