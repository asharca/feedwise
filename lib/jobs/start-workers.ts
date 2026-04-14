import { startFeedWorker } from "./workers/feed-worker";
import { scheduleFeedRefreshes } from "./scheduler";
import { processDailyDigests } from "./workers/digest-worker";

const worker = startFeedWorker();

// Run scheduler every 15 minutes
const INTERVAL_MS = 15 * 60 * 1000;

async function runScheduler() {
  try {
    const count = await scheduleFeedRefreshes();
    if (count > 0) {
      console.log(`[scheduler] Enqueued ${count} feed(s) for refresh`);
    }
  } catch (err) {
    console.error("[scheduler] Failed:", err);
  }
}

async function runDigestWorker() {
  try {
    await processDailyDigests();
  } catch (err) {
    console.error("[digest] Failed:", err);
  }
}

runScheduler();
runDigestWorker();
const schedulerTimer = setInterval(runScheduler, INTERVAL_MS);
const digestTimer = setInterval(runDigestWorker, 60 * 1000); // Check every minute

console.log("[workers] Feed worker and scheduler started (interval: 15m), digest worker (interval: 1m)");

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[workers] ${signal} received, shutting down...`);
  clearInterval(schedulerTimer);
  await worker.close();
  console.log("[workers] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
