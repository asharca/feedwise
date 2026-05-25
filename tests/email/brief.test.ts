import { describe, it, expect } from "vitest";
import { briefText } from "@/lib/email/brief";

describe("briefText", () => {
  it("strips HTML and collapses whitespace", () => {
    expect(briefText("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });
  it("decodes common entities", () => {
    expect(briefText("A &amp; B &lt;ok&gt;")).toBe("A & B <ok>");
  });
  it("clamps to maxLen with ellipsis", () => {
    expect(briefText("x".repeat(200), 10)).toBe("xxxxxxxxx…");
  });
  it("returns empty string for null/empty", () => {
    expect(briefText(null)).toBe("");
    expect(briefText("   ")).toBe("");
  });
});
