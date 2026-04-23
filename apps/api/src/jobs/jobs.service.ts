import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JobStatus } from "@prisma/client";

import type { AggregatedJob, ExternalJobSource, SourceBoardConfig } from "@aijobs/types";
import { splitCsv } from "@aijobs/config";
import { compareJobsByPostedAt, interleaveBoardJobs, isTargetRole } from "@aijobs/utils";

import { AshbyAdapter } from "./adapters/ashby.adapter";
import { GreenhouseAdapter } from "./adapters/greenhouse.adapter";
import { LeverAdapter } from "./adapters/lever.adapter";
import { getStarterBoardCatalog, getStarterBoards, getStarterBoardSummary } from "./board-catalog";
import { getTargetCompanies } from "./target-company-catalog";
import type { AggregateJobsResult, SourceAdapter } from "./jobs.types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class JobsService {
  private readonly adapters: Record<ExternalJobSource, SourceAdapter>;

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
  }

  listConfiguredSources() {
    return {
      starter: getStarterBoardSummary(),
      configured: this.getConfiguredBoards(),
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
    const jobs = (await adapter.fetchJobs(boardToken))
      .filter((job) => isTargetRole(job))
      .sort((left, right) => compareJobsByPostedAt(right, left));

    const seenSourceKeys: string[] = [];
    let persisted = 0;

    for (const job of jobs) {
      seenSourceKeys.push(job.id);
      await this.prisma.job.upsert({
        where: { sourceKey: job.id },
        create: {
          sourceKey: job.id,
          sourceId: job.id,
          sourceName: job.source,
          boardToken: job.boardToken,
          title: job.title,
          company: job.company,
          companyDomain: this.companyDomain(job.companyLogoUrl),
          companyLogoUrl: job.companyLogoUrl,
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
          companyDomain: this.companyDomain(job.companyLogoUrl),
          companyLogoUrl: job.companyLogoUrl,
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
        where: source ? { sourceName: source } : undefined,
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
          .filter((job) => isTargetRole(job))
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
