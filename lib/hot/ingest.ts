import { applyRulesToNewHotItems } from "@/lib/rules/apply";
import { fetchHotSource } from "./client";
import { recordHotFailure, saveHotSnapshot } from "@/lib/db/queries/hot";

export interface HotIngestDeps {
  fetch: typeof fetchHotSource;
  save: typeof saveHotSnapshot;
  recordFailure: typeof recordHotFailure;
  applyRules: typeof applyRulesToNewHotItems;
  now: () => Date;
}

const defaultDeps: HotIngestDeps = {
  fetch: fetchHotSource,
  save: saveHotSnapshot,
  recordFailure: recordHotFailure,
  applyRules: applyRulesToNewHotItems,
  now: () => new Date(),
};

export async function ingestHotSource(key: string, deps: HotIngestDeps = defaultDeps) {
  try {
    const items = await deps.fetch(key);
    const { itemCount, newItems } = await deps.save(key, items, deps.now());
    if (newItems.length) {
      try {
        await deps.applyRules(newItems);
      } catch (error) {
        console.error(`[hot] ${key}: 处理新热榜规则失败`, error);
      }
    }
    return { itemCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "热榜源抓取失败";
    await deps.recordFailure(key, message, deps.now());
    throw error;
  }
}
