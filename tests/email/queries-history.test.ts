// tests/email/queries-history.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { transaction: vi.fn(), select: vi.fn() } }));
vi.mock("@/lib/db/schema", () => ({
  emailDigestLogs: {
    id: "id",
    userId: "userId",
    sentAt: "sentAt",
    articleCount: "articleCount",
    status: "status",
    errorMessage: "errorMessage",
  },
  emailDigestLogArticles: { logId: "logId", articleId: "articleId" },
  articles: {
    id: "id",
    title: "title",
    url: "url",
    summary: "summary",
    aiSummary: "aiSummary",
    importance: "importance",
    feedId: "feedId",
    publishedAt: "publishedAt",
  },
  feeds: { id: "id", title: "title" },
  articleTags: { articleId: "articleId", tagId: "tagId" },
  tags: { id: "id", name: "name" },
}));

import { db } from "@/lib/db";
import {
  getArticlesForLog,
  getDigestLogById,
  logDigestSendWithArticles,
} from "@/lib/email/queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDigestLogById", () => {
  it("returns the row scoped to userId", async () => {
    const where = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue([
      {
        id: "log-1",
        sentAt: new Date("2026-06-03"),
        articleCount: 3,
        status: "success",
        errorMessage: null,
      },
    ]);
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where, limit }) } as any);

    const result = await getDigestLogById("log-1", "user-1");
    expect(result?.id).toBe("log-1");
    expect(where).toHaveBeenCalled();
  });

  it("returns null when no row matches", async () => {
    const where = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where, limit }) } as any);

    const result = await getDigestLogById("missing", "user-1");
    expect(result).toBeNull();
  });
});

describe("getArticlesForLog", () => {
  it("returns [] when the join finds no rows", async () => {
    const where = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ where }) }) }) }),
    } as any);

    const result = await getArticlesForLog("log-1", "user-1");
    expect(result).toEqual([]);
  });

  it("joins articles and tags, scoped to userId", async () => {
    const articleRows = [
      {
        id: "art-1",
        title: "T",
        url: "https://x",
        summary: "s",
        aiSummary: null,
        importance: null,
        feedId: "f-1",
        feedTitle: "Feed",
        publishedAt: null,
      },
    ];
    const tagRows = [{ articleId: "art-1", tagId: "tag-1", tagName: "News" }];

    const where = vi.fn().mockResolvedValue(articleRows);
    const tagWhere = vi.fn().mockResolvedValue(tagRows);
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({ innerJoin: () => ({ innerJoin: () => ({ where }) }) }),
        }),
      } as any)
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: tagWhere }) }) } as any);

    const result = await getArticlesForLog("log-1", "user-1");
    expect(result).toHaveLength(1);
    expect(result[0].tags).toEqual([{ id: "tag-1", name: "News" }]);
  });
});

describe("logDigestSendWithArticles", () => {
  it("returns the new log id and inserts articles when ids are non-empty", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-log" }]);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn(), returning });
    const txInsert = vi.fn().mockReturnValue({ values });
    const tx = { insert: txInsert };
    vi.mocked(db.transaction).mockImplementation(async (fn: any) => fn(tx));

    const logId = await logDigestSendWithArticles("user-1", ["a", "b"], 2, "success");
    expect(logId).toBe("new-log");
    expect(txInsert).toHaveBeenCalledTimes(2); // logs + log_articles
  });

  it("skips the articles insert when ids are empty", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-log" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const txInsert = vi.fn().mockReturnValue({ values });
    const tx = { insert: txInsert };
    vi.mocked(db.transaction).mockImplementation(async (fn: any) => fn(tx));

    const logId = await logDigestSendWithArticles("user-1", [], 0, "failed", "boom");
    expect(logId).toBe("new-log");
    expect(txInsert).toHaveBeenCalledTimes(1); // logs only
  });
});
