import { startFeedWorker } from "./workers/feed-worker";
import { scheduleFeedRefreshes } from "./scheduler";

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

runScheduler();
const schedulerTimer = setInterval(runScheduler, INTERVAL_MS);

console.log("[workers] Feed worker and scheduler started (interval: 15m)");

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
