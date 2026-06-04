import { describe, it, expect } from "vitest";
import { dedupeByCanonicalUrl, dedupeByTitleSimilarity } from "@/lib/digest/dedupe";
import type { DigestArticle } from "@/lib/digest/types";

function art(over: Partial<DigestArticle> = {}): DigestArticle {
  return {
    id: over.id ?? crypto.randomUUID(),
    title: over.title ?? "default",
    url: over.url ?? "https://example.com/" + (over.id ?? "x"),
    summary: over.summary ?? null,
    aiSummary: over.aiSummary ?? null,
    importance: over.importance ?? null,
    feedTitle: over.feedTitle ?? "feed",
    feedId: over.feedId ?? "00000000-0000-4000-a000-000000000001",
    publishedAt: over.publishedAt ?? new Date("2026-05-19T00:00:00Z"),
    tags: over.tags ?? [],
  };
}

describe("dedupeByCanonicalUrl", () => {
  it("merges exact-URL duplicates, primary = earliest publishedAt", () => {
    const a = art({
      id: "a",
      url: "https://e.com/x?utm_source=hn",
      publishedAt: new Date("2026-05-19T05:00:00Z"),
    });
    const b = art({
      id: "b",
      url: "https://e.com/x",
      publishedAt: new Date("2026-05-19T03:00:00Z"),
    });
    const c = art({ id: "c", url: "https://e.com/y" });
    const out = dedupeByCanonicalUrl([a, b, c]);
    expect(out).toHaveLength(2);
    const merged = out.find((d) => d.duplicates.length > 0)!;
    expect(merged.primary.id).toBe("b");
    expect(merged.duplicates.map((d) => d.id)).toEqual(["a"]);
  });

  it("keeps singleton with empty duplicates", () => {
    const a = art({ id: "a" });
    const out = dedupeByCanonicalUrl([a]);
    expect(out).toEqual([{ primary: a, duplicates: [] }]);
  });

  it("handles empty input", () => {
    expect(dedupeByCanonicalUrl([])).toEqual([]);
  });

  it("treats empty/invalid URL as unique", () => {
    const a = art({ id: "a", url: "" });
    const b = art({ id: "b", url: "" });
    const out = dedupeByCanonicalUrl([a, b]);
    expect(out).toHaveLength(2);
  });
});

describe("dedupeByTitleSimilarity", () => {
  it("merges high-similarity titles (Jaccard >= 0.85)", () => {
    const a = {
      primary: art({ id: "a", title: "OpenAI launches GPT-5 with vision support" }),
      duplicates: [],
    };
    const b = {
      primary: art({ id: "b", title: "OpenAI launches GPT-5 with vision support today" }),
      duplicates: [],
    };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(1);
    expect(out[0].duplicates.map((d) => d.id)).toContain("b");
  });

  it("keeps distinct titles separate (Jaccard < 0.85)", () => {
    const a = { primary: art({ id: "a", title: "OpenAI launches GPT-5" }), duplicates: [] };
    const b = {
      primary: art({ id: "b", title: "Anthropic releases new Claude model" }),
      duplicates: [],
    };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(2);
  });

  it("primary keeps earlier publishedAt when merging", () => {
    const a = {
      primary: art({
        id: "a",
        title: "Bun 2.0 released today with new features",
        publishedAt: new Date("2026-05-19T10:00:00Z"),
      }),
      duplicates: [],
    };
    const b = {
      primary: art({
        id: "b",
        title: "Bun 2.0 released today with new features now",
        publishedAt: new Date("2026-05-19T08:00:00Z"),
      }),
      duplicates: [],
    };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(1);
    expect(out[0].primary.id).toBe("b");
  });

  it("ignores null/empty titles", () => {
    const a = { primary: art({ id: "a", title: "" }), duplicates: [] };
    const b = { primary: art({ id: "b", title: "" }), duplicates: [] };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(2);
  });
});
