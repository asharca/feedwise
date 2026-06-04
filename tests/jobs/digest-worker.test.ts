import { describe, it, expect } from "vitest";
import { assembleDigestForSubscription } from "@/lib/jobs/workers/digest-worker";
import type { DigestArticle } from "@/lib/digest/types";

function art(n: number, opts: Partial<DigestArticle> = {}): DigestArticle {
  return {
    id: `f47ac10b-58cc-4372-a567-${String(n).padStart(12, "0")}`,
    title: `T-${n}`,
    url: `https://e.com/${n}`,
    summary: null,
    aiSummary: null,
    importance: null,
    feedTitle: "f",
    feedId: "feed-1",
    publishedAt: new Date(),
    tags: [],
    ...opts,
  };
}

describe("assembleDigestForSubscription (tag-based, LLM-free)", () => {
  it("groups articles by primary tag, untagged → ungrouped", async () => {
    const articles = [
      art(1, { tags: [{ id: "t-ai", name: "ai" }] }),
      art(2, { tags: [{ id: "t-ai", name: "ai" }] }),
      art(3, { tags: [{ id: "t-news", name: "news" }] }),
      art(4, { tags: [] }),
    ];
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.mode).toBe("clustered");
    expect(out.digest.topicGroups.map((g) => g.topic).sort()).toEqual(["ai", "news"]);
    const ai = out.digest.topicGroups.find((g) => g.topic === "ai")!;
    expect(ai.totalCount).toBe(2);
    expect(out.digest.ungrouped).toHaveLength(1);
    expect(out.digest.ungrouped[0].id).toBe(articles[3].id);
  });

  it("orders tag groups by article count desc", async () => {
    const articles = [
      art(1, { tags: [{ id: "small", name: "small" }] }),
      art(2, { tags: [{ id: "big", name: "big" }] }),
      art(3, { tags: [{ id: "big", name: "big" }] }),
      art(4, { tags: [{ id: "big", name: "big" }] }),
    ];
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.topicGroups.map((g) => g.topic)).toEqual(["big", "small"]);
  });

  it("returns articles with importance=high as top headlines, capped at 5", async () => {
    const articles = Array.from({ length: 7 }, (_, i) =>
      art(i + 1, {
        importance: "high",
        tags: [{ id: "x", name: "x" }],
      }),
    );
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.topHeadlines).toHaveLength(5);
  });

  it("preserves all article ids in allArticleIds", async () => {
    const articles = [art(1), art(2), art(3)];
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.allArticleIds.sort()).toEqual(articles.map((a) => a.id).sort());
  });

  it("returns empty digest for empty input (no crash)", async () => {
    const out = await assembleDigestForSubscription("user", []);
    expect(out.digest.topicGroups).toHaveLength(0);
    expect(out.digest.ungrouped).toHaveLength(0);
    expect(out.allArticleIds).toEqual([]);
  });
});
