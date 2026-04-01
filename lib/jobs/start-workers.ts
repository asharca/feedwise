import { startFeedWorker } from "./workers/feed-worker";
import { scheduleFeedRefreshes } from "./scheduler";

startFeedWorker();

// Run scheduler every 15 minutes
const INTERVAL_MS = 15 * 60 * 1000;
scheduleFeedRefreshes().catch(console.error);
setInterval(() => scheduleFeedRefreshes().catch(console.error), INTERVAL_MS);

console.log("[workers] Feed worker and scheduler started");
