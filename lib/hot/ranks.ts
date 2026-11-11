import type { HotItem } from "./types";

export interface StoredHotRank {
  snapshotId: string;
  id: string;
  title: string;
  url: string;
  rank: number;
  heat: number | null;
  firstSeenAt: Date;
  cover: string | null;
  desc: string | null;
}

/**
 * Compare full previous ranks, even when a returning item was previously below 30.
 * Without a previous snapshot there is no baseline, so nothing is marked new.
 */
export function computeHotItems(
  latest: { id: string; capturedAt: Date },
  current: StoredHotRank[],
  previous: StoredHotRank[] | null,
): HotItem[] {
  const previousRanks = new Map(previous?.map((item) => [item.id, item.rank]));
  return current
    .filter((item) => item.rank <= 30)
    .sort((a, b) => a.rank - b.rank)
    .map(({ snapshotId: _snapshotId, firstSeenAt, ...item }) => ({
      ...item,
      firstSeenAt: firstSeenAt.toISOString(),
      rankDelta: previousRanks.has(item.id) ? previousRanks.get(item.id)! - item.rank : null,
      isNew: previous !== null && firstSeenAt.getTime() === latest.capturedAt.getTime(),
    }));
}
