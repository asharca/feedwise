import { describe, it, expect } from "vitest";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import type { OrganizedDigest } from "@/lib/digest/types";

const fixture: OrganizedDigest = {
  date: new Date("2026-05-19T08:00:00Z"),
  totalArticles: 3,
  topicCount: 1,
  topHeadlines: [
    {
      cluster: { topic: "AI", headline: "OpenAI ships GPT-5", importance: 9, articleIds: ["a"] },
      primaryArticle: { id: "a", title: "OpenAI ships GPT-5", url: "https://e.com/a", summary: "<p>x</p>", feedTitle: "Verge", publishedAt: new Date() },
      sourceCount: 3,
    },
  ],
  topicGroups: [
    {
      topic: "AI",
      totalCount: 3,
      clusters: [
        {
          cluster: { topic: "AI", headline: "OpenAI ships GPT-5", importance: 9, articleIds: ["a", "b", "c"] },
          primary: { id: "a", title: "OpenAI ships GPT-5", url: "https://e.com/a", summary: "<p>main</p>", feedTitle: "Verge", publishedAt: new Date() },
          duplicates: [
            { id: "b", title: "OpenAI GPT-5 launch", url: "https://e.com/b", summary: null, feedTitle: "HN", publishedAt: null },
            { id: "c", title: "GPT-5 released today", url: "https://e.com/c", summary: null, feedTitle: "TechCrunch", publishedAt: null },
          ],
        },
      ],
    },
  ],
  ungrouped: [],
  mode: "clustered",
};

describe("renderDigestHtml", () => {
  it("renders Top Headlines section with star importance and source count", () => {
    const html = renderDigestHtml(fixture);
    expect(html).toMatch(/TOP HEADLINES/i);
    expect(html).toContain("OpenAI ships GPT-5");
    expect(html).toContain("3 sources");
    expect(html).toContain("9");
  });

  it("renders topic groups with totalCount and folded sources", () => {
    const html = renderDigestHtml(fixture);
    expect(html).toContain(">AI <");
    expect(html).toContain("(3)");
    expect(html).toContain("OpenAI GPT-5 launch");
    expect(html).toContain("other source");
  });

  it("renders Ungrouped section only when ungrouped is non-empty", () => {
    const html = renderDigestHtml(fixture);
    expect(html).not.toContain("Ungrouped");
    const withU = renderDigestHtml({
      ...fixture,
      ungrouped: [
        { id: "u", title: "Misc article", url: "https://e.com/u", summary: null, feedTitle: "F", publishedAt: null },
      ],
    });
    expect(withU).toContain("Ungrouped");
    expect(withU).toContain("Misc article");
  });
});
