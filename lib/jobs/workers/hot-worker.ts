import { Worker } from "bullmq";
import { enqueueHotFetch, getConnection } from "@/lib/jobs/queue";
import { getHotSourceStates, pruneHotHistory } from "@/lib/db/queries/hot";
import { ingestHotSource } from "@/lib/hot/ingest";
import { getHotSource, HOT_SOURCES, refreshDelayMs } from "@/lib/hot/sources";

export function startHotWorker() {
  const worker = new Worker<{ key: string }>(
    "hot.fetch",
    async (job) => {
      const source = getHotSource(job.data.key);
      if (!source) throw new Error("未知热榜源");
      return ingestHotSource(source.key);
    },
    { connection: getConnection(), concurrency: 4 },
  );
  worker.on("failed", (job, error) => {
    console.error(`[hot-worker] ${job?.id} failed:`, error.message);
  });
  return worker;
}

/** Called at startup and every five minutes; failures do not disable a source. */
export async function scheduleHotRefreshes(now = new Date()) {
  await pruneHotHistory(now);
  const states = new Map((await getHotSourceStates()).map((state) => [state.key, state]));
  let queued = 0;
  for (const source of HOT_SOURCES) {
    const state = states.get(source.key);
    if (
      state?.lastFetchedAt &&
      now.getTime() - state.lastFetchedAt.getTime() <
        refreshDelayMs(source, state.consecutiveFailures)
    )
      continue;
    await enqueueHotFetch(source.key);
    queued++;
  }
  return queued;
}
