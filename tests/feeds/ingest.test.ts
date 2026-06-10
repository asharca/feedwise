// tests/feeds/ingest.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedError } from "@/lib/feeds/feed-error";

const h = vi.hoisted(() => {
  const updateCalls: Array<{ set: unknown }> = [];
  const insertedIds = [{ id: "a-1" }, { id: "a-2" }];
  const tx = {
    update: () => ({
      set: (set: unknown) => {
        updateCalls.push({ set });
        return { where: async () => undefined };
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => insertedIds,
        }),
      }),
    }),
  };
  const db = {
    transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    update: tx.update,
  };
  return { db, updateCalls, insertedIds };
});

vi.mock("@/lib/db", () => ({ db: h.db }));

import { ingestFeed } from "@/lib/feeds/ingest";

function deps(overrides: Partial<Parameters<typeof ingestFeed>[2]> = {}) {
  return {
    parse: vi.fn(async () => ({
      title: "Feed",
      description: null,
      siteUrl: null,
      iconUrl: null,
      articles: [
        { guid: "g1", url: "https://e.com/1", title: "A1", author: null, contentHtml: null, contentText: null, summary: null, imageUrl: null, publishedAt: null },
      ],
    })),
    publish: vi.fn(async () => undefined),
    getSubscribers: vi.fn(async () => ["u1", "u2"]),
    ...overrides,
  };
}

beforeEach(() => {
  h.updateCalls.length = 0;
  h.db.transaction.mockClear();
});

describe("ingestFeed", () => {
  it("updates feed metadata and inserts articles in one transaction, then publishes per subscriber", async () => {
    const d = deps();
    const out = await ingestFeed("feed-1", "https://e.com/rss", d);
    expect(h.db.transaction).toHaveBeenCalledTimes(1);
    expect(out.articleCount).toBe(2); // returning() rows
    expect(d.publish).toHaveBeenCalledTimes(2);
    expect(d.publish).toHaveBeenCalledWith("u1", { type: "articles.new", feedId: "feed-1", count: 2 });
  });

  it("publishes feed.fetched (no articles.new) when the feed has no entries", async () => {
    const d = deps({
      parse: vi.fn(async () => ({ title: "Feed", description: null, siteUrl: null, iconUrl: null, articles: [] })),
    });
    const out = await ingestFeed("feed-1", "https://e.com/rss", d);
    expect(out.articleCount).toBe(0);
    expect(d.publish).toHaveBeenCalledWith("u1", { type: "feed.fetched", feedId: "feed-1" });
  });

  it("on parse failure: records the error on the feed, notifies subscribers, rethrows a FeedError", async () => {
    const d = deps({ parse: vi.fn(async () => { throw new Error("not a feed"); }) });
    await expect(ingestFeed("feed-1", "https://e.com/rss", d)).rejects.toBeInstanceOf(FeedError);
    // failure path writes via db.update (outside transaction)
    expect(h.updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(d.publish).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ type: "feed.error", feedId: "feed-1" }),
    );
  });
});
