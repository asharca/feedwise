import { describe, it, expect } from "vitest";
import { buildFallback } from "@/lib/digest/fallback";
import type { DedupedArticle } from "@/lib/digest/types";

function art(id: string): DedupedArticle {
  return {
    primary: {
      id,
      title: `t-${id}`,
      url: `https://e.com/${id}`,
      summary: null,
      aiSummary: null,
      importance: null,
      feedTitle: "f",
      feedId: "00000000-0000-4000-a000-000000000001",
      publishedAt: new Date(),
      tags: [],
    },
    duplicates: [],
  };
}

describe("buildFallback", () => {
  it("returns mode=fallback-no-config and ungrouped contains all articles", () => {
    const ids = ["f47ac10b-58cc-4372-a567-0e02b2c3d479", "550e8400-e29b-41d4-a716-446655440000"];
    const out = buildFallback(ids.map(art), "no-config");
    expect(out.mode).toBe("fallback-no-config");
    expect(out.ungrouped.map((a) => a.id).sort()).toEqual(ids.sort());
    expect(out.topHeadlines).toEqual([]);
    expect(out.topicGroups).toEqual([]);
    expect(out.totalArticles).toBe(2);
  });

  it("supports llm-failed reason", () => {
    const out = buildFallback([art("f47ac10b-58cc-4372-a567-0e02b2c3d479")], "llm-failed");
    expect(out.mode).toBe("fallback-llm-failed");
  });

  it("handles empty input", () => {
    const out = buildFallback([], "no-config");
    expect(out.ungrouped).toEqual([]);
    expect(out.totalArticles).toBe(0);
  });
});
