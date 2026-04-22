import "dotenv/config";

import { QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

const queueName = "health-check";

const queueEvents = new QueueEvents(queueName, { connection });
void queueEvents.waitUntilReady();

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`[worker] processed job ${job.id}`, job.data);
    return { ok: true };
  },
  { connection },
);

worker.on("ready", () => {
  console.log(`[worker] listening on queue "${queueName}"`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id ?? "unknown"} failed`, error);
});

const shutdown = async () => {
  await worker.close();
  await queueEvents.close();
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

