import "dotenv/config";

import { PrismaClient, JobStatus } from "@prisma/client";
import { QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { compareJobsByPostedAt, isTargetRole, isUsRelevantJob } from "@aijobs/utils";
import type { AggregatedJob, ExternalJobSource } from "@aijobs/types";

import { AshbyAdapter } from "../../api/src/jobs/adapters/ashby.adapter";
import { GreenhouseAdapter } from "../../api/src/jobs/adapters/greenhouse.adapter";
import { LeverAdapter } from "../../api/src/jobs/adapters/lever.adapter";
import { discoverBoardsForCompany } from "../../api/src/jobs/board-discovery";
import { getStarterBoardMetadata } from "../../api/src/jobs/board-catalog";
import { getTargetCompanyById } from "../../api/src/jobs/target-company-catalog";
import {
  BOARD_DISCOVERY_QUEUE,
  JOBS_INGEST_QUEUE,
  type BoardDiscoveryPayload,
  type JobsIngestPayload,
} from "../../api/src/jobs/jobs-queue";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

const adapters: Record<ExternalJobSource, { fetchJobs(boardToken: string): Promise<AggregatedJob[]> }> = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
  adzuna: {
    async fetchJobs() {
      return [];
    },
  },
};

function toDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function contentHash(job: AggregatedJob) {
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

function companyDomain(logoUrl?: string | null) {
  if (!logoUrl) return null;

  try {
    const url = new URL(logoUrl);
    return url.searchParams.get("domain_url");
  } catch {
    return null;
  }
}

async function processBoardIngest({ source, boardToken }: JobsIngestPayload) {
  const metadata = getStarterBoardMetadata(source, boardToken);
  const adapter = adapters[source];
  let jobs: AggregatedJob[];
  let usJobs: AggregatedJob[];

  try {
    const fetchedJobs = await adapter.fetchJobs(boardToken);
    usJobs = fetchedJobs.filter((job) => isUsRelevantJob(job));
    jobs = usJobs
      .filter((job) => isTargetRole(job))
      .sort((left, right) => compareJobsByPostedAt(right, left));
  } catch (error) {
    await (prisma as any).sourceBoard.upsert({
      where: {
        sourceName_boardToken: {
          sourceName: source,
          boardToken,
        },
      },
      create: {
        sourceName: source,
        boardToken,
        company: metadata?.company ?? boardToken,
        companyDomain: metadata?.domain ?? null,
        tier: metadata?.tier ?? null,
        status: "failed",
        lastCheckedAt: new Date(),
        lastFailureAt: new Date(),
        lastFailureReason: error instanceof Error ? error.message : "Unknown ingest error",
        lastSeenJobCount: 0,
        lastTargetJobCount: 0,
      },
      update: {
        company: metadata?.company ?? boardToken,
        companyDomain: metadata?.domain ?? null,
        tier: metadata?.tier ?? null,
        status: "failed",
        lastCheckedAt: new Date(),
        lastFailureAt: new Date(),
        lastFailureReason: error instanceof Error ? error.message : "Unknown ingest error",
        lastSeenJobCount: 0,
        lastTargetJobCount: 0,
      },
    });

    throw error;
  }

  const seenSourceKeys: string[] = [];

  for (const job of jobs) {
    seenSourceKeys.push(job.id);
    await prisma.job.upsert({
      where: { sourceKey: job.id },
      create: {
        sourceKey: job.id,
        sourceId: job.id,
        sourceName: job.source,
        boardToken: job.boardToken,
        title: job.title,
        company: job.company,
        companyDomain: companyDomain(job.companyLogoUrl),
        companyLogoUrl: job.companyLogoUrl,
        location: job.location,
        employmentType: job.employmentType,
        remoteType: job.workMode,
        description: job.description ?? "",
        applyUrl: job.applyUrl,
        postedAt: toDate(job.postedAt),
        sourceUpdatedAt: toDate(job.postedAt),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
        contentHash: contentHash(job),
        status: JobStatus.active,
      },
      update: {
        title: job.title,
        company: job.company,
        companyDomain: companyDomain(job.companyLogoUrl),
        companyLogoUrl: job.companyLogoUrl,
        location: job.location,
        employmentType: job.employmentType,
        remoteType: job.workMode,
        description: job.description ?? "",
        applyUrl: job.applyUrl,
        postedAt: toDate(job.postedAt),
        sourceUpdatedAt: toDate(job.postedAt),
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
        contentHash: contentHash(job),
        status: JobStatus.active,
        syncCount: { increment: 1 },
      },
    });
  }

  await prisma.job.updateMany({
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

  await (prisma as any).sourceBoard.upsert({
    where: {
      sourceName_boardToken: {
        sourceName: source,
        boardToken,
      },
    },
    create: {
      sourceName: source,
      boardToken,
      company: metadata?.company ?? usJobs[0]?.company ?? jobs[0]?.company ?? boardToken,
      companyDomain:
        metadata?.domain ?? companyDomain(usJobs[0]?.companyLogoUrl ?? jobs[0]?.companyLogoUrl) ?? null,
      tier: metadata?.tier ?? null,
      status: usJobs.length ? "working" : "empty",
      lastCheckedAt: new Date(),
      lastSuccessAt: new Date(),
      lastFailureReason: null,
      lastSeenJobCount: usJobs.length,
      lastTargetJobCount: jobs.length,
      totalPersistedJobs: jobs.length,
    },
    update: {
      company: metadata?.company ?? usJobs[0]?.company ?? jobs[0]?.company ?? boardToken,
      companyDomain:
        metadata?.domain ?? companyDomain(usJobs[0]?.companyLogoUrl ?? jobs[0]?.companyLogoUrl) ?? null,
      tier: metadata?.tier ?? null,
      status: usJobs.length ? "working" : "empty",
      lastCheckedAt: new Date(),
      lastSuccessAt: new Date(),
      lastFailureReason: null,
      lastSeenJobCount: usJobs.length,
      lastTargetJobCount: jobs.length,
      totalPersistedJobs: jobs.length,
    },
  });

  return {
    source,
    boardToken,
    persisted: jobs.length,
  };
}

async function processBoardDiscovery(
  { companyId, targetType = "catalog" }: BoardDiscoveryPayload,
  onProgress?: (progress: Record<string, unknown>) => Promise<void>,
) {
  if (targetType === "candidate") {
    const candidateCompany = await (prisma as any).candidateCompany.findUnique({
      where: { id: companyId },
    });

    if (!candidateCompany) {
      throw new Error(`Unknown candidate discovery target: ${companyId}`);
    }

    await (prisma as any).candidateCompany.update({
      where: { id: candidateCompany.id },
      data: {
        status: "discovering",
        lastDiscoveryError: null,
      },
    });

    const company = {
      id: candidateCompany.id,
      company: candidateCompany.company,
      domain: candidateCompany.companyDomain ?? new URL(candidateCompany.homepage).hostname.replace(/^www\./i, ""),
      homepage: candidateCompany.homepage,
      careersUrl: candidateCompany.careersUrl ?? candidateCompany.homepage,
      segments: candidateCompany.segments ?? [],
      priorityTier: "P2" as const,
      expectedSource: (candidateCompany.sourceHint ?? "greenhouse") as ExternalJobSource,
    };

    const result = await discoverBoardsForCompany(company, async (progress) => {
      await onProgress?.({
        ...progress,
        company: company.company,
      });
    });

    for (const board of result.discovered) {
      await (prisma as any).candidateBoard.upsert({
        where: {
          sourceName_boardToken_candidateCompanyId: {
            sourceName: board.source,
            boardToken: board.boardToken,
            candidateCompanyId: candidateCompany.id,
          },
        },
        create: {
          candidateCompanyId: candidateCompany.id,
          sourceName: board.source,
          boardToken: board.boardToken,
          evidenceUrl: board.evidenceUrl,
          status: "discovered",
        },
        update: {
          evidenceUrl: board.evidenceUrl,
          status: "discovered",
          validationError: null,
        },
      });
    }

    await (prisma as any).candidateCompany.update({
      where: { id: candidateCompany.id },
      data: {
        status: result.discovered.length > 0 ? "discovered" : "no_supported_board",
        lastDiscoveredAt: new Date(),
        lastDiscoveryError:
          result.discovered.length === 0 && result.errors.length > 0
            ? result.errors.map((error) => `${error.url}: ${error.message}`).slice(0, 3).join(" | ")
            : null,
      },
    });

    return {
      companyId,
      discovered: result.discovered.length,
      boards: result.discovered,
      errors: result.errors,
      targetType,
    };
  }

  const company = getTargetCompanyById(companyId);

  if (!company) {
    throw new Error(`Unknown discovery target: ${companyId}`);
  }

  const result = await discoverBoardsForCompany(company, async (progress) => {
    await onProgress?.({
      ...progress,
      company: company.company,
    });
  });

  for (const board of result.discovered) {
    const existing = await (prisma as any).sourceBoard.findUnique({
      where: {
        sourceName_boardToken: {
          sourceName: board.source,
          boardToken: board.boardToken,
        },
      },
    });

    await (prisma as any).sourceBoard.upsert({
      where: {
        sourceName_boardToken: {
          sourceName: board.source,
          boardToken: board.boardToken,
        },
      },
      create: {
        sourceName: board.source,
        boardToken: board.boardToken,
        company: company.company,
        companyDomain: company.domain,
        tier: company.priorityTier,
        status: "unverified",
        lastFailureReason: null,
      },
      update: {
        company: company.company,
        companyDomain: company.domain,
        tier: company.priorityTier,
        active: true,
        ...(existing?.status === "working" || existing?.status === "empty" || existing?.status === "failed"
          ? {}
          : { status: "unverified", lastFailureReason: null }),
      },
    });
  }

  return {
    companyId,
    discovered: result.discovered.length,
    boards: result.discovered,
    errors: result.errors,
    targetType,
  };
}

const queueEvents = new QueueEvents(JOBS_INGEST_QUEUE, { connection });
void queueEvents.waitUntilReady();
const discoveryQueueEvents = new QueueEvents(BOARD_DISCOVERY_QUEUE, { connection });
void discoveryQueueEvents.waitUntilReady();

const worker = new Worker<JobsIngestPayload>(
  JOBS_INGEST_QUEUE,
  async (job) => {
    await job.updateProgress({
      stage: "fetching_board",
      message: `Fetching ${job.data.source}/${job.data.boardToken}`,
    });

    const result = await processBoardIngest(job.data);
    await job.updateProgress({
      stage: "completed",
      message: `Persisted ${result.persisted} jobs for ${result.source}/${result.boardToken}`,
      persisted: result.persisted,
      source: result.source,
      boardToken: result.boardToken,
    });
    console.log(`[worker] ingested ${result.persisted} jobs for ${result.source}/${result.boardToken}`);
    return result;
  },
  { connection, concurrency: 4 },
);

const discoveryWorker = new Worker<BoardDiscoveryPayload>(
  BOARD_DISCOVERY_QUEUE,
  async (job) => {
    await job.updateProgress({
      stage: "starting",
      message: `Preparing discovery for ${job.data.companyId}`,
    });

    const result = await processBoardDiscovery(job.data, async (progress) => {
      await job.updateProgress(progress);
    });

    await job.updateProgress({
      stage: "completed",
      message:
        result.discovered === 0
          ? "No new board candidates found"
          : `Found ${result.discovered} new board candidate${result.discovered === 1 ? "" : "s"}`,
      companyId: result.companyId,
      discoveredBoards: result.discovered,
      errors: result.errors.length,
    });
    console.log(
      `[worker] discovered ${result.discovered} board candidates for ${result.companyId}`,
    );
    return result;
  },
  { connection, concurrency: 4 },
);

worker.on("ready", () => {
  console.log(`[worker] listening on queue "${JOBS_INGEST_QUEUE}"`);
});

discoveryWorker.on("ready", () => {
  console.log(`[worker] listening on queue "${BOARD_DISCOVERY_QUEUE}"`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id ?? "unknown"} failed`, error);
});

discoveryWorker.on("failed", (job, error) => {
  console.error(`[worker] discovery job ${job?.id ?? "unknown"} failed`, error);
});

const shutdown = async () => {
  await discoveryWorker.close();
  await worker.close();
  await discoveryQueueEvents.close();
  await queueEvents.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
