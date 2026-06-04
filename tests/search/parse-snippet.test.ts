import { describe, it, expect } from "vitest";
import { parseSnippet } from "@/lib/search/parse-snippet";

describe("parseSnippet", () => {
  it("returns empty array for null / undefined / empty", () => {
    expect(parseSnippet(null)).toEqual([]);
    expect(parseSnippet(undefined)).toEqual([]);
    expect(parseSnippet("")).toEqual([]);
  });

  it("returns a single text part when there is no marker", () => {
    expect(parseSnippet("hello world")).toEqual([{ type: "text", value: "hello world" }]);
  });

  it("splits a single match", () => {
    expect(parseSnippet("the ⟦async⟧ story")).toEqual([
      { type: "text", value: "the " },
      { type: "match", value: "async" },
      { type: "text", value: " story" },
    ]);
  });

  it("splits multiple matches", () => {
    expect(parseSnippet("⟦a⟧ b ⟦c⟧ d ⟦e⟧")).toEqual([
      { type: "match", value: "a" },
      { type: "text", value: " b " },
      { type: "match", value: "c" },
      { type: "text", value: " d " },
      { type: "match", value: "e" },
    ]);
  });

  it("treats an unclosed start marker as text (defensive)", () => {
    expect(parseSnippet("ok ⟦unclosed")).toEqual([
      { type: "text", value: "ok " },
      { type: "text", value: "⟦unclosed" },
    ]);
  });

  it("handles adjacent matches", () => {
    expect(parseSnippet("⟦a⟧⟦b⟧")).toEqual([
      { type: "match", value: "a" },
      { type: "match", value: "b" },
    ]);
  });
});
