import { Worker } from "bullmq";
import { getConnection } from "@/lib/jobs/queue";
import { ingestFeed } from "@/lib/feeds/ingest";

export function startFeedWorker() {
  const worker = new Worker(
    "feed.fetch",
    async (job) => {
      const { feedId, url } = job.data as { feedId: string; url: string };
      await ingestFeed(feedId, url);
    },
    { connection: getConnection(), concurrency: 5 },
  );

  worker.on("completed", (job) => {
    console.log(`[feed-worker] ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[feed-worker] ${job?.id} failed:`, err.message);
  });

  return worker;
}
