import { describe, it, expect } from "vitest";
import { briefText } from "@/lib/email/brief";

describe("briefText", () => {
  it("strips HTML and collapses whitespace", () => {
    expect(briefText("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });
  it("decodes common entities", () => {
    expect(briefText("A &amp; B &lt;ok&gt;")).toBe("A & B <ok>");
  });
  it("decodes common typographic entities", () => {
    expect(briefText("Tom &mdash; Jerry&rsquo;s &hellip;")).toBe("Tom — Jerry’s …");
  });
  it("drops unrecognized entities instead of leaking them", () => {
    expect(briefText("A &fakeent; B")).toBe("A B");
  });
  it("clamps to maxLen with ellipsis", () => {
    expect(briefText("x".repeat(200), 10)).toBe("xxxxxxxxx…");
  });
  it("returns empty string for null/empty", () => {
    expect(briefText(null)).toBe("");
    expect(briefText("   ")).toBe("");
  });
});
