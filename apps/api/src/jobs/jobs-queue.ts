import { Queue } from "bullmq";
import IORedis from "ioredis";

import type { ExternalJobSource } from "@aijobs/types";

export const JOBS_INGEST_QUEUE = "jobs-ingest";
export const BOARD_DISCOVERY_QUEUE = "board-discovery";

export type JobsIngestPayload = {
  source: ExternalJobSource;
  boardToken: string;
};

export type BoardDiscoveryPayload = {
  companyId: string;
};

export function createRedisConnection() {
  return new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });
}

export function createJobsIngestQueue(connection = createRedisConnection()) {
  return new Queue<JobsIngestPayload>(JOBS_INGEST_QUEUE, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 200,
      removeOnFail: 200,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    },
  });
}

export function createBoardDiscoveryQueue(connection = createRedisConnection()) {
  return new Queue<BoardDiscoveryPayload>(BOARD_DISCOVERY_QUEUE, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 200,
      removeOnFail: 200,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    },
  });
}
