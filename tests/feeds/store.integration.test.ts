// Opt in against a migrated PostgreSQL test database, not a production instance.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "@/lib/db";
import { articles, feeds } from "@/lib/db/schema";
import { parseFeed } from "@/lib/feeds/parser";
import { saveFetch } from "@/lib/feeds/store";

it.skipIf(process.env.FEEDWISE_TEST_POSTGRES !== "1")(
  "returns inserts only and does not rewrite unchanged articles",
  async () => {
    const url = "https://example.org/" + randomUUID();
    const [{ id }] = await db
      .insert(feeds)
      .values({ url, consecutiveFailures: 2 })
      .returning({ id: feeds.id });
    const version = async () =>
      (
        await db
          .select({ version: sql<string>`xmin::text` })
          .from(articles)
          .where(eq(articles.feedId, id))
      )[0].version;
    try {
      const body =
        '<rss version="2.0"><channel><title>Feed</title><item><guid>1</guid><title>Original</title></item></channel></rss>';
      const result = {
        url,
        body,
        etag: "v1",
        lastModified: null,
        contentType: "application/xml",
        maxAgeMs: 0,
      };
      const feed = parseFeed(body, url);
      expect(await saveFetch(id, url, result, feed)).toHaveLength(1);
      const original = await version();
      expect(await saveFetch(id, url, result, feed)).toEqual([]);
      expect(await version()).toBe(original);
      feed.articles[0].title = "Revised";
      expect(await saveFetch(id, url, result, feed)).toEqual([]);
      expect(await version()).not.toBe(original);
      await saveFetch(id, url, { ...result, body: null, etag: "v2" }, null);
      const [row] = await db.select().from(feeds).where(eq(feeds.id, id));
      expect(row).toMatchObject({
        etag: "v2",
        consecutiveFailures: 0,
        lastFetchError: null,
        lastFetchedAt: expect.any(Date),
        nextFetchAt: expect.any(Date),
      });
    } finally {
      await db.delete(feeds).where(eq(feeds.id, id));
    }
  },
);

it.skipIf(process.env.FEEDWISE_TEST_POSTGRES !== "1")(
  "uses only the newest 30 eligible publication dates, including after a 304",
  async () => {
    const url = "https://example.org/" + randomUUID();
    const [{ id }] = await db.insert(feeds).values({ url }).returning({ id: feeds.id });
    const now = Date.now();
    const poll = async () => {
      await saveFetch(
        id,
        url,
        { url, body: null, etag: null, lastModified: null, contentType: "", maxAgeMs: 0 },
        null,
      );
      const [row] = await db
        .select({ interval: feeds.fetchIntervalMinutes })
        .from(feeds)
        .where(eq(feeds.id, id));
      return row.interval;
    };
    try {
      // Exactly one date in range: future, stale and undated items count only for the fallback.
      await db.insert(articles).values(
        [now - 60_000, now + 86_400_000, now - 31 * 86_400_000, null].map((ms, i) => ({
          feedId: id,
          guid: "boundary-" + i,
          publishedAt: ms === null ? null : new Date(ms),
        })),
      );
      expect(await poll()).toBe(1440);
      // 30 hourly gaps, plus an eligible but older outlier. Taking more than 30 skews the estimate.
      await db.insert(articles).values(
        [...Array.from({ length: 30 }, (_, i) => i + 1), 24 * 20].map((hours) => ({
          feedId: id,
          guid: "gap-" + hours,
          publishedAt: new Date(now - 60_000 - hours * 3_600_000),
        })),
      );
      expect(await poll()).toBe(60);
    } finally {
      await db.delete(feeds).where(eq(feeds.id, id));
    }
  },
);
