import { describe, it, expect } from "vitest";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import type { OrganizedDigest, DigestArticle } from "@/lib/digest/types";

function art(id: string, title: string): DigestArticle {
  return {
    id,
    title,
    url: `https://e.com/${id}`,
    summary: `<p>Brief for ${title}</p>`,
    aiSummary: null,
    importance: null,
    feedTitle: "Reuters",
    feedId: "00000000-0000-4000-a000-000000000001",
    publishedAt: new Date("2026-05-25T08:00:00Z"),
    tags: [],
  };
}

function digest(): OrganizedDigest {
  const a = art("a", "Ceasefire talks resume");
  const b = art("b", "Earthquake hits coast");
  const cluster = (topic: string, headline: string, importance: number) => ({
    topic,
    headline,
    importance,
    articleIds: [] as string[],
  });
  return {
    date: new Date("2026-05-25T08:00:00Z"),
    totalArticles: 2,
    topicCount: 1,
    topHeadlines: [
      { cluster: cluster("World", "Ceasefire talks resume", 9), primaryArticle: a, sourceCount: 3 },
    ],
    topicGroups: [
      {
        topic: "World",
        totalCount: 2,
        clusters: [
          { cluster: cluster("World", "Ceasefire talks resume", 9), primary: a, duplicates: [] },
          { cluster: cluster("World", "Earthquake hits coast", 8), primary: b, duplicates: [] },
        ],
      },
    ],
    ungrouped: [],
    mode: "clustered",
  };
}

describe("renderDigestHtml (layout A)", () => {
  it("renders multiple event items under a topic", async () => {
    const html = await renderDigestHtml(digest());
    expect(html).toContain("Ceasefire talks resume");
    expect(html).toContain("Earthquake hits coast");
  });
  it("contains no expand/collapse markup", async () => {
    const html = await renderDigestHtml(digest());
    expect(html).not.toContain("<details");
    expect(html).not.toMatch(/other source/i);
  });
  it("renders the plain-text brief, not raw HTML summary", async () => {
    const html = await renderDigestHtml(digest());
    expect(html).toContain("Brief for Ceasefire talks resume");
    expect(html).not.toContain("<p>Brief for");
  });
  it("uses the injected buildLink for article hrefs", async () => {
    const html = await renderDigestHtml(digest(), (a) => `https://app/r?id=${a.id}`);
    expect(html).toContain('href="https://app/r?id=a"');
    expect(html).toContain('href="https://app/r?id=b"');
  });
  it("defaults links to the article url", async () => {
    const html = await renderDigestHtml(digest());
    expect(html).toContain('href="https://e.com/a"');
  });
  it("contains no <img> tags", async () => {
    expect(await renderDigestHtml(digest())).not.toContain("<img");
  });
  it("omits the TOP STORIES header when there are no headlines", async () => {
    const d = digest();
    d.topHeadlines = [];
    expect(await renderDigestHtml(d)).not.toContain("TOP STORIES");
  });
});
