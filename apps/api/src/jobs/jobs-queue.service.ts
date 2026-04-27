import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Job, Queue } from "bullmq";

import type { ExternalJobSource } from "@aijobs/types";

import {
  createBoardDiscoveryQueue,
  createCandidatePipelineQueue,
  createJobsIngestQueue,
  createRedisConnection,
  type BoardDiscoveryPayload,
  type CandidatePipelinePayload,
  type JobsIngestPayload,
} from "./jobs-queue";

type QueueSnapshotInput = {
  discoveryJobIds?: string[];
  ingestJobIds?: string[];
};

type QueueJobSummary = {
  id: string;
  name: string;
  state: string;
  data: Record<string, unknown>;
  progress: unknown;
  failedReason: string | null;
  returnValue: unknown;
  attemptsMade: number;
  processedOn: number | null;
  finishedOn: number | null;
  timestamp: number | null;
};

@Injectable()
export class JobsQueueService implements OnModuleDestroy {
  private readonly connection = createRedisConnection();
  private readonly queue = createJobsIngestQueue(this.connection);
  private readonly discoveryQueue = createBoardDiscoveryQueue(this.connection);
  private readonly candidatePipelineQueue = createCandidatePipelineQueue(this.connection);

  async enqueueBoardIngests(payloads: JobsIngestPayload[]) {
    if (!payloads.length) {
      return [];
    }

    const jobs = await this.queue.addBulk(
      payloads.map((payload) => ({
        name: `ingest:${payload.source}:${payload.boardToken}`,
        data: payload,
      })),
    );

    return jobs.map((job) => ({
      id: job.id,
      source: payloads.find((payload) => payload.boardToken === job.data.boardToken && payload.source === job.data.source)
        ?.source as ExternalJobSource,
      boardToken: job.data.boardToken,
    }));
  }

  async enqueueBoardDiscoveries(payloads: BoardDiscoveryPayload[]) {
    if (!payloads.length) {
      return [];
    }

    const jobs = await this.discoveryQueue.addBulk(
      payloads.map((payload) => ({
        name: `discover:${payload.companyId}`,
        data: payload,
      })),
    );

    return jobs.map((job) => ({
      id: job.id,
      companyId: job.data.companyId,
    }));
  }

  async enqueueCandidatePipelines(payloads: CandidatePipelinePayload[]) {
    if (!payloads.length) {
      return [];
    }

    const jobs = await this.candidatePipelineQueue.addBulk(
      payloads.map((payload) => ({
        name: `candidate-pipeline:${payload.companyId}`,
        data: payload,
      })),
    );

    return jobs.map((job) => ({
      id: job.id,
      companyId: job.data.companyId,
    }));
  }

  async getJobStatus(jobId: string) {
    const job =
      (await this.queue.getJob(jobId)) ??
      (await this.discoveryQueue.getJob(jobId)) ??
      (await this.candidatePipelineQueue.getJob(jobId));
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      state: await job.getState(),
      failedReason: job.failedReason ?? null,
      data: job.data,
    };
  }

  async getPipelineSnapshot(input?: QueueSnapshotInput) {
    return {
      discovery: await this.buildQueueSnapshot(this.discoveryQueue, input?.discoveryJobIds),
      candidatePipeline: await this.buildQueueSnapshot(this.candidatePipelineQueue),
      ingest: await this.buildQueueSnapshot(this.queue, input?.ingestJobIds),
    };
  }

  private async buildQueueSnapshot<TPayload extends JobsIngestPayload | BoardDiscoveryPayload | CandidatePipelinePayload>(
    queue: Queue<TPayload>,
    trackedJobIds?: string[],
  ) {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );

    const trackedJobs = trackedJobIds?.length
      ? (
          await Promise.all(
            trackedJobIds.map(async (jobId) => queue.getJob(jobId)),
          )
        ).filter(Boolean) as Array<Job<TPayload>>
      : [];

    const recentJobs = (await queue.getJobs(
      ["active", "waiting", "completed", "failed", "delayed"],
      0,
      9,
      false,
    )) as Array<Job<TPayload>>;

    const serializedTracked = await Promise.all(
      trackedJobs.map((job) => this.serializeJob(job)),
    );

    const serializedRecent = await Promise.all(
      recentJobs
        .filter((job) => !trackedJobs.some((trackedJob) => trackedJob.id === job.id))
        .map((job) => this.serializeJob(job)),
    );

    const trackedCounts = serializedTracked.reduce(
      (summary, job) => {
        summary.total += 1;

        if (job.state === "completed") summary.completed += 1;
        else if (job.state === "failed") summary.failed += 1;
        else if (job.state === "active") summary.active += 1;
        else summary.waiting += 1;

        return summary;
      },
      {
        total: 0,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
      },
    );

    return {
      counts,
      trackedCounts,
      hasActiveWork: (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) > 0,
      trackedJobs: serializedTracked,
      recentJobs: serializedRecent,
    };
  }

  private async serializeJob<TPayload extends JobsIngestPayload | BoardDiscoveryPayload | CandidatePipelinePayload>(
    job: Job<TPayload>,
  ): Promise<QueueJobSummary> {
    return {
      id: String(job.id),
      name: job.name,
      state: await job.getState(),
      data: job.data as Record<string, unknown>,
      progress: job.progress ?? null,
      failedReason: job.failedReason ?? null,
      returnValue: job.returnvalue ?? null,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
      timestamp: job.timestamp ?? null,
    };
  }

  async onModuleDestroy() {
    await this.candidatePipelineQueue.close();
    await this.discoveryQueue.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
