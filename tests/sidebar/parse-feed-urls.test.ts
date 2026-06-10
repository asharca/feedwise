import { describe, it, expect } from "vitest";
import { parseFeedUrlLines } from "@/components/layout/sidebar/parse-feed-urls";

describe("parseFeedUrlLines", () => {
  it("splits one URL per line and trims whitespace", () => {
    expect(parseFeedUrlLines("  https://a.com/rss  \nhttps://b.com/feed\n")).toEqual([
      "https://a.com/rss",
      "https://b.com/feed",
    ]);
  });

  it("drops empty lines", () => {
    expect(parseFeedUrlLines("https://a.com/rss\n\n   \nhttps://b.com/feed")).toEqual([
      "https://a.com/rss",
      "https://b.com/feed",
    ]);
  });

  it("returns [] for blank input", () => {
    expect(parseFeedUrlLines("   \n  ")).toEqual([]);
  });
});
