// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/queries/hot", () => ({ readHotBoards: vi.fn() }));
import { readHotBoards } from "@/lib/db/queries/hot";
import { computeHotTrending, getHotBoards } from "@/lib/hot/boards";
import { HOT_SOURCES, sourceInfo } from "@/lib/hot/sources";
import type { HotBoard, HotItem } from "@/lib/hot/types";

const now = new Date("2026-11-12T00:00:00Z");
function item(id: string, rankDelta: number | null, isNew = false, rank = 1): HotItem {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    rankDelta,
    isNew,
    rank,
    heat: null,
    firstSeenAt: now.toISOString(),
    cover: null,
    desc: null,
  };
}

beforeEach(() => {
  vi.mocked(readHotBoards).mockReset();
});

describe("hot boards", () => {
  it("includes failing sources with last good items, uninitialized sources, and fixed config order", async () => {
    vi.mocked(readHotBoards).mockResolvedValue({
      states: [
        { key: "thepaper", lastFetchedAt: now, lastError: null, consecutiveFailures: 0 },
        { key: "weibo", lastFetchedAt: now, lastError: "热榜源暂时不可用", consecutiveFailures: 1 },
      ],
      snapshots: [
        { id: "paper", sourceKey: "thepaper", capturedAt: now, position: 1 },
        { id: "weibo", sourceKey: "weibo", capturedAt: now, position: 1 },
      ],
      ranks: ["paper", "weibo"].map((snapshotId) => ({
        snapshotId,
        id: snapshotId,
        title: "事件",
        url: "https://example.com",
        rank: 1,
        heat: null,
        firstSeenAt: now,
        cover: null,
        desc: null,
      })),
    });
    const boards = await getHotBoards("news");
    expect(boards.map((board) => board.source.key)).toEqual(
      HOT_SOURCES.filter((source) => source.category === "news").map((source) => source.key),
    );
    expect(boards[0]).toMatchObject({
      status: "ok",
      fetchedAt: now.toISOString(),
      items: [expect.objectContaining({ isNew: false })],
    });
    expect(boards.find((board) => board.source.key === "weibo")).toMatchObject({
      status: "error",
      error: "热榜源暂时不可用",
      items: [expect.objectContaining({ id: "weibo" })],
    });
    expect(boards.find((board) => board.source.key === "qq-news")).toMatchObject({
      status: "empty",
      error: null,
      fetchedAt: null,
      items: [],
    });
    expect(boards[0].source).not.toHaveProperty("intervalMinutes");
  });

  it("marks a successful empty snapshot as empty, preserving its capture time", async () => {
    vi.mocked(readHotBoards).mockResolvedValue({
      states: [],
      snapshots: [{ id: "s", sourceKey: "zhihu", capturedAt: now, position: 1 }],
      ranks: [],
    });
    const boards = await getHotBoards("community");
    expect(boards[0]).toMatchObject({
      source: { key: "zhihu" },
      status: "empty",
      fetchedAt: now.toISOString(),
      items: [],
    });
  });
});

describe("hot trending", () => {
  it("sorts rising items by positive delta first, new items second, excluding old flat/falling items", () => {
    const board: HotBoard = {
      source: sourceInfo(HOT_SOURCES[0]),
      status: "ok",
      error: null,
      fetchedAt: now.toISOString(),
      items: [
        item("new", null, true),
        item("flat", 0),
        item("fall", -2),
        item("slow", 2),
        item("fast", 9),
        item("below", 20, false, 31),
      ],
    };
    expect(computeHotTrending([board]).rising.map((entry) => entry.id)).toEqual([
      "fast",
      "slow",
      "new",
    ]);
    board.items = Array.from({ length: 30 }, (_, i) => item(String(i), i + 1, false, i + 1));
    expect(computeHotTrending([board]).rising).toHaveLength(20);
  });
});
