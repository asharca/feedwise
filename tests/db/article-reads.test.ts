import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// Compile through the real Postgres dialect, capturing bound SQL without
// requiring Redis or a populated database to exercise the read paths.
const { queries } = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[] }));
vi.mock("@/lib/db", () => {
  return {
    db: drizzle(async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    }),
  };
});

import {
  getArticles,
  getReadingHistory,
  getArticleById,
  getArticlesGroupedByFolder,
  getTodayArticles,
  getUntaggedArticlesForUser,
  getUnsummarizedArticlesForUser,
  markAllRead,
  getUserTagsWithCounts,
} from "@/lib/db/queries/articles";
import { searchArticles, searchFeedsByName, searchTagsByName } from "@/lib/db/queries/search";
import { getDashboardStats, getDashboardTimeline } from "@/lib/db/queries/stats";

beforeEach(() => {
  queries.length = 0;
});
const cursor = { at: "2026-08-05T00:00:00.123456Z", id: "ad426ae9-a045-4322-b744-cdacbbfde624" };

describe("article query contract", () => {
  it("uses the same indexed key for sorting and cursor comparison, with lookahead", async () => {
    await getArticles("u", { cursor, search: "rust", view: "article", limit: 2 });
    const [{ sql, params }] = queries;
    expect(sql).toContain('("articles"."sort_at", "articles"."id") <');
    expect(sql).toMatch(/order by "articles"\."sort_at" desc.*"articles"\."id" desc/);
    expect(sql).toContain('"search_tsv" @@ feedwise_search_query(');
    expect(sql).toContain('coalesce("subscriptions"."view", "feeds"."default_view", \'article\')');
    expect(sql).not.toMatch(/offset|simhash|to_tsvector/i);
    expect(params).toEqual(expect.arrayContaining([cursor.at, cursor.id, 3]));
  });

  it("paginates history by read time without requiring a current subscription", async () => {
    await getReadingHistory("u", { cursor });
    const [{ sql }] = queries;
    expect(sql).toContain('("user_articles"."read_at", "articles"."id") <');
    expect(sql).toContain('order by "user_articles"."read_at" desc, "articles"."id" desc');
    expect(sql).toContain('left join "subscriptions"');
    expect(sql).toContain('"is_hidden" is not true');
  });

  it("projects the detail extension explicitly, never the bigint fingerprint", async () => {
    await getArticleById("u", cursor.id);
    const [{ sql }] = queries;
    for (const col of [
      "media",
      "view",
      "full_content_html",
      "full_content_status",
      "fetch_full_text",
      "is_hidden",
    ]) {
      expect(sql).toContain(`"${col}"`);
    }
    expect(sql).not.toContain("simhash");
  });

  it("excludes hidden article rows in all article counts, lists and enrichment candidates", async () => {
    await Promise.all([
      getArticles("u"),
      getArticlesGroupedByFolder("u"),
      getTodayArticles("u"),
      markAllRead("u"),
      getUntaggedArticlesForUser("u", 3, 2),
      getUnsummarizedArticlesForUser("u", 3, 2),
      getUserTagsWithCounts("u"),
      getDashboardStats("u"),
      getDashboardTimeline("u", new Date(), new Date()),
      searchFeedsByName("u", "rust"),
      searchTagsByName("u", "rust"),
    ]);
    for (const { sql } of queries) {
      if (/\bfrom "(?:articles|article_tags|user_articles)"/.test(sql))
        expect(sql).toContain("is_hidden");
    }
  });

  it.each(["猫", "rust", "!?"])("filters and ranks %s via the generated document", async (q) => {
    await searchArticles("u", { q });
    const [{ sql, params }] = queries;
    expect(params).toContain(q);
    expect(sql).toContain('"search_tsv" @@ feedwise_search_query(');
    expect(sql).toContain('ts_rank_cd("articles"."search_tsv", feedwise_search_query(');
    expect(sql).toContain('"is_hidden" is not true');
    expect(sql).not.toMatch(/to_tsvector|ilike/i);
    if (q === "rust") expect(sql).toContain("ts_headline('simple'");
  });
});
