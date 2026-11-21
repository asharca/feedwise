import { ensureEncryptionConfigured } from "@/lib/crypto/startup-check";
ensureEncryptionConfigured();

import { Worker } from "bullmq";
import { startFullTextWorker } from "@/lib/jobs/workers/fulltext-worker";
import { startNotifyWorker } from "@/lib/jobs/workers/notify-worker";
import { startFeedWorker } from "./workers/feed-worker";
import { scheduleFeedRefreshes } from "./scheduler";
import { processDailyDigests } from "./workers/digest-worker";
import { runAutoTagging, runAutoSummarizing } from "./workers/enrichment-worker";
import { scheduleHotRefreshes, startHotWorker } from "./workers/hot-worker";
import { closeJobQueues, getConnection, getMaintenanceQueue } from "./queue";

const minute = 60_000;
const tasks = new Map<string, { every: number; run: () => Promise<unknown> }>([
  ["feed-schedule", { every: minute, run: scheduleFeedRefreshes }],
  ["hot-schedule", { every: 5 * minute, run: scheduleHotRefreshes }],
  ["digest", { every: minute, run: processDailyDigests }],
  ["auto-tag", { every: 5 * minute, run: runAutoTagging }],
  ["auto-summary", { every: 5 * minute, run: runAutoSummarizing }],
]);

const workers: Worker[] = [];

async function start() {
  const queue = getMaintenanceQueue();
  // A slow tick must not overlap the next one on another replica.
  await queue.setGlobalConcurrency(1);
  for (const [name, { every }] of tasks) {
    await queue.upsertJobScheduler(
      name,
      { every },
      {
        name,
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
  }

  const maintenance = new Worker(
    queue.name,
    async (job) => {
      const task = tasks.get(job.name);
      if (!task) throw new Error(`Unknown maintenance job: ${job.name}`);
      await task.run();
    },
    { connection: getConnection() },
  );
  maintenance.on("failed", (job, err) => console.error(`[maintenance] ${job?.name} failed:`, err));
  workers.push(maintenance);
  for (const create of [startFeedWorker, startHotWorker, startFullTextWorker, startNotifyWorker]) {
    workers.push(create());
  }
  console.log("[workers] Feed, hot, full text, notify and maintenance workers started");
}

const startup = start();
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  let status = 0;
  try {
    await startup;
  } catch (err) {
    console.error("[workers] Startup failed:", err);
    status = 1;
  }
  for (const result of await Promise.allSettled(workers.map((worker) => worker.close()))) {
    if (result.status === "rejected") {
      console.error("[workers] Failed to drain worker:", result.reason);
      status = 1;
    }
  }
  try {
    await closeJobQueues();
  } catch (err) {
    console.error("[workers] Failed to close queues:", err);
    status = 1;
  }
  process.exit(status);
}

void startup.catch(shutdown);
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
