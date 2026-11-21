import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  buildArticlesUrl,
  buildHistoryUrl,
  flattenArticlePages,
  markAllInPagesRead,
  parseContentView,
  updateArticleInPages,
} from "@/lib/reader/article-cache";
import type { CursorPage } from "@/lib/reader/types";

describe("parseContentView", () => {
  it("accepts valid content views and rejects others", () => {
    expect(parseContentView("article")).toBe("article");
    expect(parseContentView("social")).toBe("social");
    expect(parseContentView("picture")).toBe("picture");
    expect(parseContentView("video")).toBe("video");
    expect(parseContentView("audio")).toBe("audio");
    expect(parseContentView("unread")).toBeUndefined();
    expect(parseContentView("all")).toBeUndefined();
    expect(parseContentView(null)).toBeUndefined();
  });
});

describe("URL builders", () => {
  it("builds cursor-paginated /api/articles URLs omitting empty filters and view for 全部", () => {
    const url = buildArticlesUrl({
      feedId: "f1",
      unread: true,
      search: "rust",
      view: "video",
    });
    expect(url).toBe("/api/articles?feedId=f1&unread=true&search=rust&view=video&limit=50");

    const allViews = buildArticlesUrl({ starred: true }, "cursor-abc");
    expect(allViews).toBe("/api/articles?starred=true&limit=50&cursor=cursor-abc");
    expect(allViews).not.toContain("view=");
    expect(allViews).not.toContain("offset=");
  });

  it("builds cursor-paginated /api/articles/history URLs", () => {
    expect(buildHistoryUrl()).toBe("/api/articles/history?limit=50");
    expect(buildHistoryUrl("ai", "c2", 25)).toBe(
      "/api/articles/history?limit=25&search=ai&cursor=c2",
    );
  });
});

describe("infinite page helpers", () => {
  const sample: InfiniteData<CursorPage<{ id: string; isRead: boolean; isStarred: boolean }>> = {
    pageParams: [undefined, "c1"],
    pages: [
      {
        items: [
          { id: "a1", isRead: false, isStarred: false },
          { id: "a2", isRead: true, isStarred: false },
        ],
        nextCursor: "c1",
      },
      {
        items: [
          { id: "a2", isRead: true, isStarred: false },
          { id: "a3", isRead: false, isStarred: true },
        ],
        nextCursor: null,
      },
    ],
  };

  it("flattens and deduplicates pages while preserving order", () => {
    expect(flattenArticlePages(sample).map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(flattenArticlePages(undefined)).toEqual([]);
  });

  it("updates a single article across all pages immutably", () => {
    const updated = updateArticleInPages(sample, "a3", { isRead: true, isStarred: false });
    expect(updated?.pages[1].items[1]).toEqual({ id: "a3", isRead: true, isStarred: false });
    expect(updated?.pages[0]).toBe(sample.pages[0]);
    expect(updateArticleInPages(sample, "missing", { isRead: true })).toBe(sample);
  });

  it("marks all unread articles read across pages", () => {
    const updated = markAllInPagesRead(sample);
    expect(updated?.pages.flatMap((p) => p.items.map((i) => i.isRead))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});
