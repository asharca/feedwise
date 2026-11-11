import { fetchHotSource } from "./client";
import { recordHotFailure, saveHotSnapshot } from "@/lib/db/queries/hot";

export interface HotIngestDeps {
  fetch: typeof fetchHotSource;
  save: typeof saveHotSnapshot;
  recordFailure: typeof recordHotFailure;
  now: () => Date;
}

const defaultDeps: HotIngestDeps = {
  fetch: fetchHotSource,
  save: saveHotSnapshot,
  recordFailure: recordHotFailure,
  now: () => new Date(),
};

export async function ingestHotSource(key: string, deps: HotIngestDeps = defaultDeps) {
  try {
    const items = await deps.fetch(key);
    return await deps.save(key, items, deps.now());
  } catch (error) {
    const message = error instanceof Error ? error.message : "热榜源抓取失败";
    await deps.recordFailure(key, message, deps.now());
    throw error;
  }
}
