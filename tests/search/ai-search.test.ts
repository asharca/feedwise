// tests/search/ai-search.test.ts
import { describe, it, expect } from "vitest";
import { parseAiSearchResponse, buildArticleListBlock } from "@/lib/search/ai-search";

const pool = [
  { id: "a0", title: "T0", feedTitle: "F0", url: "https://e.com/0", summary: "s0" },
  { id: "a1", title: "T1", feedTitle: "F1", url: "https://e.com/1", summary: "s1" },
];

describe("parseAiSearchResponse", () => {
  it("maps valid indices to cited articles", () => {
    const out = parseAiSearchResponse({ answer: "ok", indices: [1] }, pool);
    expect(out.answer).toBe("ok");
    expect(out.articles).toEqual([
      { id: "a1", title: "T1", feedTitle: "F1", url: "https://e.com/1", summary: "s1" },
    ]);
  });

  it("drops out-of-range, negative, and non-integer indices", () => {
    const out = parseAiSearchResponse({ answer: "ok", indices: [-1, 0, 2, 1.5] }, pool);
    expect(out.articles.map((a) => a.id)).toEqual(["a0"]);
  });

  it("tolerates a malformed response shape", () => {
    const out = parseAiSearchResponse({ answer: 42, indices: "nope" }, pool);
    expect(out.answer).toBe("");
    expect(out.articles).toEqual([]);
  });
});

describe("buildArticleListBlock", () => {
  it("renders numbered entries with title, feed, summary", () => {
    const block = buildArticleListBlock(pool);
    expect(block).toContain("[0] T0 (F0)");
    expect(block).toContain("[1] T1 (F1)");
  });
});
