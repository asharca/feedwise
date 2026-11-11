// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/jobs/queue", () => ({ enqueueHotFetch: vi.fn(), getConnection: vi.fn() }));
vi.mock("@/lib/db/queries/hot", () => ({
  getHotSourceStates: vi.fn(),
  pruneHotHistory: vi.fn(),
  recordHotFailure: vi.fn(),
  saveHotSnapshot: vi.fn(),
}));
import { getHotSourceStates, pruneHotHistory } from "@/lib/db/queries/hot";
import { enqueueHotFetch } from "@/lib/jobs/queue";
import { scheduleHotRefreshes } from "@/lib/jobs/workers/hot-worker";
import { HOT_SOURCES, refreshDelayMs } from "@/lib/hot/sources";

const now = new Date("2026-11-12T12:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getHotSourceStates).mockResolvedValue([]);
});

describe("hot scheduling", () => {
  it("queues every configured source initially and prunes old history", async () => {
    expect(await scheduleHotRefreshes(now)).toBe(HOT_SOURCES.length);
    expect(pruneHotHistory).toHaveBeenCalledExactlyOnceWith(now);
    expect(vi.mocked(enqueueHotFetch).mock.calls.map(([key]) => key)).toEqual(
      HOT_SOURCES.map((source) => source.key),
    );
  });

  it("respects configured intervals and bounded failure backoff", async () => {
    vi.mocked(getHotSourceStates).mockResolvedValue(
      HOT_SOURCES.map((source) => ({
        key: source.key,
        lastFetchedAt: new Date(now.getTime() - 20 * 60_000),
        lastError: source.key === "weibo" ? "失败" : null,
        consecutiveFailures: source.key === "weibo" ? 1 : 0,
      })),
    );
    await scheduleHotRefreshes(now);
    expect(enqueueHotFetch).not.toHaveBeenCalledWith("weibo");
    expect(enqueueHotFetch).toHaveBeenCalledWith("zhihu");
    expect(refreshDelayMs(HOT_SOURCES[0], 1)).toBe(40 * 60_000);
    expect(refreshDelayMs(HOT_SOURCES[0], 2)).toBe(80 * 60_000);
    expect(refreshDelayMs(HOT_SOURCES[0], 100)).toBe(160 * 60_000);
    expect(refreshDelayMs({ ...HOT_SOURCES[0], intervalMinutes: 1 }, 0)).toBe(10 * 60_000);
  });
});
