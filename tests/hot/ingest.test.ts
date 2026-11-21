// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/queries/hot", () => ({ saveHotSnapshot: vi.fn(), recordHotFailure: vi.fn() }));
vi.mock("@/lib/rules/apply", () => ({ applyRulesToNewHotItems: vi.fn() }));
import { ingestHotSource, type HotIngestDeps } from "@/lib/hot/ingest";

const now = new Date("2026-11-12T00:00:00Z");
const firstSeen = {
  id: "item-1",
  sourceKey: "zhihu",
  title: "事件",
  url: "https://example.com",
  desc: null,
};
function deps(): HotIngestDeps {
  return {
    fetch: vi.fn().mockResolvedValue([
      {
        itemKey: "https://example.com",
        title: "事件",
        url: "https://example.com",
        rank: 1,
        heat: null,
        cover: null,
        desc: null,
      },
    ]),
    save: vi.fn().mockResolvedValue({ itemCount: 1, newItems: [firstSeen] }),
    applyRules: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    now: () => now,
  };
}

describe("hot ingestion", () => {
  it("passes normalized items and one capture time into atomic storage", async () => {
    const d = deps();
    expect(await ingestHotSource("zhihu", d)).toEqual({ itemCount: 1 });
    expect(d.fetch).toHaveBeenCalledWith("zhihu");
    expect(d.save).toHaveBeenCalledWith(
      "zhihu",
      expect.arrayContaining([expect.objectContaining({ rank: 1 })]),
      now,
    );
    expect(d.recordFailure).not.toHaveBeenCalled();
    expect(d.applyRules).toHaveBeenCalledExactlyOnceWith([firstSeen]);
  });

  it("records source failure and propagates the original fetch error", async () => {
    const d = deps();
    const error = new Error("热榜源请求失败（HTTP 503）");
    vi.mocked(d.fetch).mockRejectedValue(error);
    await expect(ingestHotSource("weibo", d)).rejects.toBe(error);
    expect(d.save).not.toHaveBeenCalled();
    expect(d.recordFailure).toHaveBeenCalledExactlyOnceWith("weibo", error.message, now);
  });

  it("also records a failed transaction without treating it as success", async () => {
    const d = deps();
    const error = new Error("database unavailable");
    vi.mocked(d.save).mockRejectedValue(error);
    await expect(ingestHotSource("zhihu", d)).rejects.toBe(error);
    expect(d.recordFailure).toHaveBeenCalledExactlyOnceWith("zhihu", error.message, now);
  });

  it("does not fail a committed snapshot if rules fail", async () => {
    const d = deps();
    vi.mocked(d.applyRules).mockRejectedValue(new Error("rule failure"));
    expect(await ingestHotSource("zhihu", d)).toEqual({ itemCount: 1 });
    expect(d.recordFailure).not.toHaveBeenCalled();
  });

  it("persists an empty successful snapshot", async () => {
    const d = deps();
    vi.mocked(d.fetch).mockResolvedValue([]);
    vi.mocked(d.save).mockResolvedValue({ itemCount: 0, newItems: [] });
    expect(await ingestHotSource("zhihu", d)).toEqual({ itemCount: 0 });
    expect(d.save).toHaveBeenCalledWith("zhihu", [], now);
    expect(d.recordFailure).not.toHaveBeenCalled();
    expect(d.applyRules).not.toHaveBeenCalled();
  });
});
