import { describe, it, expect } from "vitest";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import type { OrganizedDigest } from "@/lib/digest/types";

const fixture: OrganizedDigest = {
  date: new Date("2026-05-19T08:00:00Z"),
  totalArticles: 2,
  topicCount: 0,
  topHeadlines: [],
  topicGroups: [],
  ungrouped: [
    { id: "a", title: "Article A", url: "https://e.com/a", summary: "<p>Summary A</p>", feedTitle: "Feed A", publishedAt: new Date("2026-05-19T07:00:00Z") },
    { id: "b", title: "Article B", url: "https://e.com/b", summary: null, feedTitle: "Feed B", publishedAt: null },
  ],
  mode: "fallback-no-config",
};

describe("renderFallbackHtml", () => {
  it("renders all ungrouped articles", async () => {
    const html = await renderFallbackHtml(fixture);
    expect(html).toContain("Article A");
    expect(html).toContain("Article B");
    expect(html).toContain("https://e.com/a");
  });

  it("uses a plain-text brief regardless of llm-failed mode (no banner)", async () => {
    const html = await renderFallbackHtml({ ...fixture, mode: "fallback-llm-failed" });
    expect(html).not.toContain("Topic clustering unavailable");
    expect(html).not.toContain("<p>Summary A</p>");
    expect(html).toContain("Summary A");
  });

  it("uses the injected buildLink for article hrefs", async () => {
    const html = await renderFallbackHtml(fixture, (a) => `https://app/r?id=${a.id}`);
    expect(html).toContain('href="https://app/r?id=a"');
    expect(html).toContain('href="https://app/r?id=b"');
  });

  it("defaults links to the article url", async () => {
    expect(await renderFallbackHtml(fixture)).toContain('href="https://e.com/a"');
  });
});
