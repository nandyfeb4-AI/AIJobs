import { Injectable, OnModuleDestroy } from "@nestjs/common";

import type { ExternalJobSource } from "@aijobs/types";

import {
  createBoardDiscoveryQueue,
  createJobsIngestQueue,
  createRedisConnection,
  type BoardDiscoveryPayload,
  type JobsIngestPayload,
} from "./jobs-queue";

@Injectable()
export class JobsQueueService implements OnModuleDestroy {
  private readonly connection = createRedisConnection();
  private readonly queue = createJobsIngestQueue(this.connection);
  private readonly discoveryQueue = createBoardDiscoveryQueue(this.connection);

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

  async getJobStatus(jobId: string) {
    const job = (await this.queue.getJob(jobId)) ?? (await this.discoveryQueue.getJob(jobId));
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

  async onModuleDestroy() {
    await this.discoveryQueue.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
