import { ensureEncryptionConfigured } from "@/lib/crypto/startup-check";
ensureEncryptionConfigured();

import { startFeedWorker } from "./workers/feed-worker";
import { scheduleFeedRefreshes } from "./scheduler";
import { processDailyDigests } from "./workers/digest-worker";
import { runAutoTagging, runAutoSummarizing } from "./workers/enrichment-worker";

const worker = startFeedWorker();

// Run scheduler every 15 minutes
const INTERVAL_MS = 15 * 60 * 1000;
const AUTO_TAG_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SUMMARY_INTERVAL_MS = 5 * 60 * 1000;

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

async function runAutoTagWorker() {
  try {
    const { users, tagged } = await runAutoTagging();
    if (tagged > 0) {
      console.log(`[auto-tag] ${tagged} tag(s) applied across ${users} user(s)`);
    }
  } catch (err) {
    console.error("[auto-tag] Failed:", err);
  }
}

async function runAutoSummaryWorker() {
  try {
    const { users, summarized } = await runAutoSummarizing();
    if (summarized > 0) {
      console.log(`[auto-summary] ${summarized} article(s) summarised across ${users} user(s)`);
    }
  } catch (err) {
    console.error("[auto-summary] Failed:", err);
  }
}

runScheduler();
runDigestWorker();
runAutoTagWorker();
runAutoSummaryWorker();
const schedulerTimer = setInterval(runScheduler, INTERVAL_MS);
const digestTimer = setInterval(runDigestWorker, 60 * 1000); // Check every minute
const autoTagTimer = setInterval(runAutoTagWorker, AUTO_TAG_INTERVAL_MS);
const autoSummaryTimer = setInterval(runAutoSummaryWorker, AUTO_SUMMARY_INTERVAL_MS);

console.log(
  "[workers] Feed worker + scheduler (15m), digest worker (1m), auto-tag worker (5m), auto-summary worker (5m) started"
);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[workers] ${signal} received, shutting down...`);
  clearInterval(schedulerTimer);
  clearInterval(digestTimer);
  clearInterval(autoTagTimer);
  clearInterval(autoSummaryTimer);
  await worker.close();
  console.log("[workers] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
