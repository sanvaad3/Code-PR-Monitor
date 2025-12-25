// Job queue configuration using BullMQ
import dotenv from "dotenv";
dotenv.config();

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not set");
}

// Redis connection
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Job data types
export type ReviewJobData = {
  pullRequestId: string;
  repositoryFullName: string;
  prNumber: number;
  installationId: number;
};

// Create review queue
export const reviewQueue = new Queue<ReviewJobData>("pr-review", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

/**
 * Add a PR review job to the queue
 */
export async function enqueueReview(
  data: ReviewJobData
): Promise<Job<ReviewJobData>> {
  const job = await reviewQueue.add("review-pr", data, {
    jobId: `pr-${data.repositoryFullName}-${data.prNumber}`, // Dedupe by PR
  });

  console.log(`Enqueued review job: ${job.id}`);
  return job;
}

/**
 * Create worker (to be called in a separate process/file)
 */
export function createReviewWorker(
  processor: (job: Job<ReviewJobData>) => Promise<void>
) {
  const worker = new Worker<ReviewJobData>("pr-review", processor, {
    connection,
    concurrency: 5, // Process 5 reviews concurrently
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000, // per 60 seconds (rate limiting)
    },
  });

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  await reviewQueue.close();
  await connection.quit();
});
