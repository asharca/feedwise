import { readHotBoards } from "@/lib/db/queries/hot";
import { HOT_SOURCES, sourceInfo } from "./sources";
import { computeHotItems, type StoredHotRank } from "./ranks";
import { clusterHotItems } from "./cluster";
import type { HotBoard, HotCategory, HotTrending } from "./types";

export async function getHotBoards(category: HotCategory | "all" = "all"): Promise<HotBoard[]> {
  const sources = HOT_SOURCES.filter(
    (source) => category === "all" || source.category === category,
  );
  const data = await readHotBoards(sources.map((source) => source.key));
  const states = new Map(data.states.map((state) => [state.key, state]));
  const ranks = new Map<string, StoredHotRank[]>();
  for (const item of data.ranks) {
    const members = ranks.get(item.snapshotId) ?? [];
    members.push(item);
    ranks.set(item.snapshotId, members);
  }
  return sources.map((source) => {
    const state = states.get(source.key);
    const [latest, previous] = data.snapshots.filter(
      (snapshot) => snapshot.sourceKey === source.key,
    );
    const items = latest
      ? computeHotItems(
          latest,
          ranks.get(latest.id) ?? [],
          previous ? (ranks.get(previous.id) ?? []) : null,
        )
      : [];
    return {
      source: sourceInfo(source),
      status: state?.lastError ? "error" : items.length > 0 ? "ok" : "empty",
      error: state?.lastError ?? null,
      fetchedAt: latest?.capturedAt.toISOString() ?? null,
      items,
    };
  });
}

export function computeHotTrending(boards: HotBoard[]): HotTrending {
  const rising = boards
    .flatMap((board) =>
      board.items
        .filter((item) => item.rank <= 30 && ((item.rankDelta ?? 0) > 0 || item.isNew))
        .map((item) => ({ ...item, source: board.source })),
    )
    .sort(
      (a, b) =>
        (b.rankDelta ?? 0) - (a.rankDelta ?? 0) ||
        Number(b.isNew) - Number(a.isNew) ||
        a.rank - b.rank ||
        a.source.key.localeCompare(b.source.key),
    )
    .slice(0, 20);
  return { rising, crossPlatform: clusterHotItems(boards) };
}
