import { describe, it, expect } from "vitest";
import { canonicalizeUrl } from "@/lib/digest/normalize-url";

describe("canonicalizeUrl", () => {
  it("strips utm_* tracking params", () => {
    expect(canonicalizeUrl("https://example.com/a?utm_source=x&utm_medium=y&id=1")).toBe(
      "https://example.com/a?id=1",
    );
  });

  it("strips fbclid, gclid, ref, ref_src", () => {
    expect(canonicalizeUrl("https://example.com/a?fbclid=abc&gclid=def&ref=g&ref_src=h&id=1")).toBe(
      "https://example.com/a?id=1",
    );
  });

  it("removes URL fragment", () => {
    expect(canonicalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("lowercases scheme and host", () => {
    expect(canonicalizeUrl("HTTPS://Example.COM/Path")).toBe("https://example.com/Path");
  });

  it("strips trailing slash from non-root paths", () => {
    expect(canonicalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("returns input unchanged for invalid URL", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
    expect(canonicalizeUrl("")).toBe("");
  });

  it("preserves query order after filtering", () => {
    const url = "https://e.com/p?b=2&utm_source=x&a=1";
    const out = canonicalizeUrl(url);
    expect(out).toBe("https://e.com/p?b=2&a=1");
  });

  it("handles null/undefined safely", () => {
    expect(canonicalizeUrl(null)).toBe("");
    expect(canonicalizeUrl(undefined)).toBe("");
  });
});
