import { describe, expect, it } from "vitest";
import { hasCjk, highlightSubstring } from "@/lib/search/highlight";

describe("CJK substring snippets", () => {
  it("highlights matches in the original text rather than bigrams", () => {
    const text = "《人工智能》：人工智能。";
    const parts = highlightSubstring(text, "人工智能");
    expect(parts.map((p) => p.value).join("")).toBe(text);
    expect(parts.filter((p) => p.type === "match").map((p) => p.value)).toEqual([
      "人工智能",
      "人工智能",
    ]);
  });

  it("keeps a late single-character hit in a bounded excerpt", () => {
    const parts = highlightSubstring("文".repeat(400) + "猫" + "字".repeat(400), "猫", 40);
    const excerpt = parts.map((p) => p.value).join("");
    expect(excerpt).toHaveLength(42);
    expect(excerpt.startsWith("…") && excerpt.endsWith("…")).toBe(true);
    expect(parts).toContainEqual({ type: "match", value: "猫" });
  });

  it("preserves mixed-language spelling and skips negative terms", () => {
    const parts = highlightSubstring("AI 技术 ⟦教程⟧", "ai技术 -教程");
    expect(parts.filter((p) => p.type === "match").map((p) => p.value)).toEqual(["AI", "技术"]);
    expect(hasCjk("ai技术")).toBe(true);
    expect(hasCjk("ai")).toBe(false);
  });

  it("handles empty, punctuation-only and unmatched input", () => {
    expect(highlightSubstring("", "。?")).toEqual([]);
    for (const query of ["。?", "日本語"]) {
      expect(highlightSubstring("原文", query)).toEqual([{ type: "text", value: "原文" }]);
    }
  });
});
