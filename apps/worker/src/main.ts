import "dotenv/config";

import { PrismaClient, JobStatus } from "@prisma/client";
import { QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { compareJobsByPostedAt, isTargetRole, isUsRelevantJob } from "@aijobs/utils";
import type { AggregatedJob, ExternalJobSource } from "@aijobs/types";

import { AshbyAdapter } from "../../api/src/jobs/adapters/ashby.adapter";
import { GreenhouseAdapter } from "../../api/src/jobs/adapters/greenhouse.adapter";
import { LeverAdapter } from "../../api/src/jobs/adapters/lever.adapter";
import { discoverBoardsForCompany, extractBoardsFromText } from "../../api/src/jobs/board-discovery";
import { getStarterBoardMetadata } from "../../api/src/jobs/board-catalog";
import { getTargetCompanies, getTargetCompanyById } from "../../api/src/jobs/target-company-catalog";
import {
  BOARD_DISCOVERY_QUEUE,
  CANDIDATE_PIPELINE_QUEUE,
  JOBS_INGEST_QUEUE,
  type BoardDiscoveryPayload,
  type CandidatePipelinePayload,
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

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function targetCompanyDomainForBoard(source: ExternalJobSource, boardToken: string, company: string) {
  const normalizedToken = normalizeText(boardToken);
  const normalizedCompany = normalizeText(company);

  return (
    getTargetCompanies().find((candidate) => {
      if (candidate.expectedSource !== source) {
        return false;
      }

      const candidateToken = normalizeText(candidate.careersUrl.split("/").pop() ?? "");
      if (candidateToken && candidateToken === normalizedToken) {
        return true;
      }

      return normalizeText(candidate.company) === normalizedCompany;
    })?.domain ?? null
  );
}

function inferExpectedSource(sourceHint?: string | null, careersUrl?: string | null): ExternalJobSource {
  if (sourceHint === "greenhouse" || sourceHint === "lever" || sourceHint === "ashby") {
    return sourceHint;
  }

  const url = careersUrl?.toLowerCase() ?? "";
  if (url.includes("lever.co")) return "lever";
  if (url.includes("ashbyhq.com")) return "ashby";
  return "greenhouse";
}

function domainFromUrl(url?: string | null) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/$/, "");
}

function isLikelyCareersPageUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const pathname = url.pathname.toLowerCase();
  if (!/(careers?|jobs?|open-roles?|positions?|join-us)/i.test(pathname)) {
    return false;
  }

  return !/\.(?:avif|bmp|css|gif|ico|jpeg|jpg|js|map|mp4|pdf|png|svg|webp|woff2?)$/i.test(pathname);
}

function findLikelyCareersUrl(html: string, baseUrl: string) {
  const matches = Array.from(html.matchAll(/href=["']([^"']*(?:careers|jobs)[^"']*)["']/gi));

  for (const match of matches) {
    const href = match[1];
    if (!href) continue;

    try {
      const url = new URL(href, baseUrl);
      if (isLikelyCareersPageUrl(url)) {
        return url.toString();
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchPage(url: string) {
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

async function enrichCandidateCompany(candidateCompany: any) {
  const homepage = normalizeUrl(candidateCompany.homepage);
  const urlsToTry = Array.from(
    new Set(
      [
        candidateCompany.careersUrl,
        homepage,
        `${homepage}/careers`,
        `${homepage}/jobs`,
        `${homepage}/company/careers`,
      ].filter(Boolean) as string[],
    ),
  );
  const errors: string[] = [];
  let careersUrl = candidateCompany.careersUrl ?? null;
  let sourceHint = candidateCompany.sourceHint ?? null;

  for (const url of urlsToTry) {
    try {
      const page = await fetchPage(url);
      const boards = extractBoardsFromText(`${page.url}\n${page.html}`, page.url);
      if (boards.length > 0) {
        const firstBoard = boards[0];
        careersUrl = firstBoard.evidenceUrl ?? page.url;
        sourceHint = firstBoard.source;
      }

      const linkedCareersUrl = findLikelyCareersUrl(page.html, page.url);
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

  return (prisma as any).candidateCompany.update({
    where: { id: candidateCompany.id },
    data: {
      careersUrl: careersUrl ?? candidateCompany.careersUrl,
      sourceHint,
      companyDomain: candidateCompany.companyDomain ?? domainFromUrl(homepage),
      lastDiscoveryError: errors.length ? errors.slice(0, 4).join(" | ") : null,
    },
  });
}

async function processBoardIngest({ source, boardToken }: JobsIngestPayload) {
  const metadata = getStarterBoardMetadata(source, boardToken);
  const adapter = adapters[source];
  const existingBoard = await (prisma as any).sourceBoard.findUnique({
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
    const resolvedDomain =
      companyDomain(job.companyLogoUrl) ??
      boardDomain ??
      metadata?.domain ??
      targetCompanyDomainForBoard(source, boardToken, job.company) ??
      null;
    const resolvedLogoUrl =
      job.companyLogoUrl ??
      (resolvedDomain
        ? `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(resolvedDomain)}`
        : null);
    await prisma.job.upsert({
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
        companyDomain: resolvedDomain,
        companyLogoUrl: resolvedLogoUrl,
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
      expectedSource: inferExpectedSource(candidateCompany.sourceHint, candidateCompany.careersUrl),
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

async function validateAndPromoteCandidateBoards(candidateCompanyId: string) {
  const boards = await (prisma as any).candidateBoard.findMany({
    where: {
      candidateCompanyId,
      status: "discovered",
    },
    include: {
      candidateCompany: true,
    },
  });
  const promoted = [];
  const rejected = [];

  for (const board of boards) {
    const source = board.sourceName as ExternalJobSource;
    const adapter = adapters[source];
    if (!adapter) {
      continue;
    }

    try {
      await (prisma as any).candidateBoard.update({
        where: { id: board.id },
        data: {
          status: "validating",
          validationError: null,
        },
      });

      const jobs = await adapter.fetchJobs(board.boardToken);
      const usJobs = jobs.filter((job) => isUsRelevantJob(job));

      if (!jobs.length || !usJobs.length) {
        const validationError = !jobs.length
          ? "Board validated but returned no jobs."
          : "Board validated but returned no US jobs.";
        await (prisma as any).candidateBoard.update({
          where: { id: board.id },
          data: {
            status: "rejected",
            validationError,
            validatedAt: new Date(),
          },
        });
        rejected.push({ source, boardToken: board.boardToken, reason: validationError });
        continue;
      }

      await (prisma as any).candidateBoard.update({
        where: { id: board.id },
        data: {
          status: "validated",
          validationError: null,
          validatedAt: new Date(),
        },
      });

      const existingBoard = await (prisma as any).sourceBoard.findUnique({
        where: {
          sourceName_boardToken: {
            sourceName: board.sourceName,
            boardToken: board.boardToken,
          },
        },
      });
      const targetBoard = existingBoard
        ? await (prisma as any).sourceBoard.update({
            where: { id: existingBoard.id },
            data: {
              company: board.candidateCompany.company,
              companyDomain:
                board.candidateCompany.companyDomain ?? domainFromUrl(board.candidateCompany.homepage),
              active: true,
            },
          })
        : await (prisma as any).sourceBoard.create({
            data: {
              sourceName: board.sourceName,
              boardToken: board.boardToken,
              company: board.candidateCompany.company,
              companyDomain:
                board.candidateCompany.companyDomain ?? domainFromUrl(board.candidateCompany.homepage),
              tier: null,
              status: "unverified",
              active: true,
            },
          });

      await (prisma as any).candidateBoard.update({
        where: { id: board.id },
        data: {
          status: "promoted",
          promotedAt: new Date(),
          promotedBoardId: targetBoard.id,
        },
      });
      promoted.push({
        source,
        boardToken: board.boardToken,
        sourceBoardId: targetBoard.id,
        sourceBoardStatus: targetBoard.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown validation error";
      await (prisma as any).candidateBoard.update({
        where: { id: board.id },
        data: {
          status: "rejected",
          validationError: message,
          validatedAt: new Date(),
        },
      });
      rejected.push({ source, boardToken: board.boardToken, reason: message });
    }
  }

  const hasPromoted = promoted.length > 0;
  await (prisma as any).candidateCompany.update({
    where: { id: candidateCompanyId },
    data: {
      status: hasPromoted ? "promoted" : "no_supported_board",
      lastDiscoveredAt: new Date(),
      lastDiscoveryError: hasPromoted
        ? null
        : rejected.map((item) => `${item.source}/${item.boardToken}: ${item.reason}`).slice(0, 3).join(" | ") ||
          null,
    },
  });

  return {
    promoted,
    rejected,
  };
}

async function processCandidatePipeline(
  { companyId }: CandidatePipelinePayload,
  onProgress?: (progress: Record<string, unknown>) => Promise<void>,
) {
  const candidateCompany = await (prisma as any).candidateCompany.findUnique({
    where: { id: companyId },
  });

  if (!candidateCompany) {
    throw new Error(`Unknown candidate pipeline target: ${companyId}`);
  }

  await onProgress?.({
    stage: "enriching",
    message: `Enriching ${candidateCompany.company}`,
    companyId,
  });
  const enrichedCompany = await enrichCandidateCompany(candidateCompany);

  await onProgress?.({
    stage: "discovering",
    message: `Discovering boards for ${enrichedCompany.company}`,
    companyId,
  });
  const discovery = await processBoardDiscovery(
    { companyId, targetType: "candidate" },
    async (progress) => {
      await onProgress?.({
        ...progress,
        pipelineStage: "discovering",
      });
    },
  );

  if (discovery.discovered === 0) {
    return {
      companyId,
      company: enrichedCompany.company,
      enriched: Boolean(enrichedCompany.careersUrl || enrichedCompany.sourceHint),
      discovered: 0,
      promoted: 0,
      rejected: 0,
      errors: discovery.errors,
    };
  }

  await onProgress?.({
    stage: "validating",
    message: `Validating and promoting boards for ${enrichedCompany.company}`,
    companyId,
    discoveredBoards: discovery.discovered,
  });
  const validation = await validateAndPromoteCandidateBoards(companyId);

  return {
    companyId,
    company: enrichedCompany.company,
    enriched: Boolean(enrichedCompany.careersUrl || enrichedCompany.sourceHint),
    discovered: discovery.discovered,
    promoted: validation.promoted.length,
    rejected: validation.rejected.length,
    errors: discovery.errors,
  };
}

const queueEvents = new QueueEvents(JOBS_INGEST_QUEUE, { connection });
void queueEvents.waitUntilReady();
const discoveryQueueEvents = new QueueEvents(BOARD_DISCOVERY_QUEUE, { connection });
void discoveryQueueEvents.waitUntilReady();
const candidatePipelineQueueEvents = new QueueEvents(CANDIDATE_PIPELINE_QUEUE, { connection });
void candidatePipelineQueueEvents.waitUntilReady();

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

const candidatePipelineWorker = new Worker<CandidatePipelinePayload>(
  CANDIDATE_PIPELINE_QUEUE,
  async (job) => {
    await job.updateProgress({
      stage: "starting",
      message: `Starting candidate pipeline for ${job.data.companyId}`,
      companyId: job.data.companyId,
    });

    const result = await processCandidatePipeline(job.data, async (progress) => {
      await job.updateProgress(progress);
    });

    await job.updateProgress({
      stage: "completed",
      message: `Candidate pipeline completed for ${result.company}`,
      companyId: result.companyId,
      discoveredBoards: result.discovered,
      promotedBoards: result.promoted,
      rejectedBoards: result.rejected,
    });
    console.log(
      `[worker] candidate pipeline ${result.company}: discovered=${result.discovered} promoted=${result.promoted} rejected=${result.rejected}`,
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

candidatePipelineWorker.on("ready", () => {
  console.log(`[worker] listening on queue "${CANDIDATE_PIPELINE_QUEUE}"`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id ?? "unknown"} failed`, error);
});

discoveryWorker.on("failed", (job, error) => {
  console.error(`[worker] discovery job ${job?.id ?? "unknown"} failed`, error);
});

candidatePipelineWorker.on("failed", (job, error) => {
  console.error(`[worker] candidate pipeline job ${job?.id ?? "unknown"} failed`, error);
});

const shutdown = async () => {
  await candidatePipelineWorker.close();
  await discoveryWorker.close();
  await worker.close();
  await candidatePipelineQueueEvents.close();
  await discoveryQueueEvents.close();
  await queueEvents.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
