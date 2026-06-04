import { describe, it, expect, vi } from "vitest";
import { runClustering, SYSTEM_PROMPT } from "@/lib/digest/cluster";
import type { DedupedArticle } from "@/lib/digest/types";
import { LlmTimeoutError } from "@/lib/digest/llm-client";

function makeDeduped(n: number): DedupedArticle[] {
  return Array.from({ length: n }, (_, i) => ({
    primary: {
      id: `11111111-1111-4111-a111-${String(i).padStart(12, "0")}`,
      title: `Title ${i}`,
      url: `https://e.com/${i}`,
      summary: `Summary ${i}`,
      aiSummary: null,
      importance: null,
      feedTitle: "feed",
      feedId: "00000000-0000-4000-a000-000000000001",
      publishedAt: new Date("2026-05-19T00:00:00Z"),
      tags: [],
    },
    duplicates: [],
  }));
}

describe("SYSTEM_PROMPT", () => {
  it("contains the topic <= 8 and importance >= 8 constraints", () => {
    expect(SYSTEM_PROMPT).toMatch(/<= 8/);
    expect(SYSTEM_PROMPT).toMatch(/importance >= 8/i);
    expect(SYSTEM_PROMPT).toMatch(/English/);
  });
});

describe("runClustering", () => {
  it("calls the client once for <= 150 articles", async () => {
    const deduped = makeDeduped(10);
    const client = vi.fn().mockResolvedValue({
      clusters: [
        {
          topic: "AI",
          headline: "Headline",
          importance: 8,
          articleIds: deduped.map((d) => d.primary.id),
        },
      ],
    });
    const out = await runClustering(deduped, client);
    expect(client).toHaveBeenCalledTimes(1);
    expect(out.clusters).toHaveLength(1);
  });

  it("batches when > 150 articles", async () => {
    const deduped = makeDeduped(310);
    const client = vi.fn().mockImplementation(async ({ user }: { user: string }) => {
      const ids = (user.match(/"id":"[^"]+"/g) ?? []).map((m) => m.slice(6, -1));
      return {
        clusters: [{ topic: "Misc", headline: "h", importance: 5, articleIds: ids }],
      };
    });
    const out = await runClustering(deduped, client);
    expect(client).toHaveBeenCalledTimes(3);
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].articleIds).toHaveLength(310);
  });

  it("filters unknown article ids from response", async () => {
    const deduped = makeDeduped(3);
    const ghost = "22222222-2222-4222-a222-222222222222";
    const client = vi.fn().mockResolvedValue({
      clusters: [
        {
          topic: "X",
          headline: "h",
          importance: 5,
          articleIds: [deduped[0].primary.id, ghost, deduped[1].primary.id],
        },
      ],
    });
    const out = await runClustering(deduped, client);
    expect(out.clusters[0].articleIds).toEqual([deduped[0].primary.id, deduped[1].primary.id]);
  });

  it("folds extra topics into 'Other' when topic count > 8", async () => {
    const deduped = makeDeduped(10);
    const client = vi.fn().mockResolvedValue({
      clusters: deduped.map((d, i) => ({
        topic: `Topic${i}`,
        headline: `h${i}`,
        importance: 10 - i,
        articleIds: [d.primary.id],
      })),
    });
    const out = await runClustering(deduped, client);
    const topics = new Set(out.clusters.map((c) => c.topic));
    expect(topics.size).toBeLessThanOrEqual(8);
    expect(topics.has("Other")).toBe(true);
  });
});

describe("runClustering — event preservation", () => {
  it("keeps distinct events under one topic as separate clusters", async () => {
    const deduped = makeDeduped(2);
    const client = vi.fn().mockResolvedValue({
      clusters: [
        {
          topic: "World",
          headline: "Ceasefire talks resume",
          importance: 8,
          articleIds: [deduped[0].primary.id],
        },
        {
          topic: "World",
          headline: "Major earthquake hits coast",
          importance: 7,
          articleIds: [deduped[1].primary.id],
        },
      ],
    });
    const out = await runClustering(deduped, client);
    expect(out.clusters).toHaveLength(2);
    expect(out.clusters.every((k) => k.topic === "World")).toBe(true);
  });

  it("retries a transient LLM failure within a batch", async () => {
    const deduped = makeDeduped(2);
    const client = vi
      .fn()
      .mockRejectedValueOnce(new LlmTimeoutError())
      .mockResolvedValue({
        clusters: [
          {
            topic: "X",
            headline: "h",
            importance: 5,
            articleIds: deduped.map((d) => d.primary.id),
          },
        ],
      });
    const out = await runClustering(deduped, client);
    expect(client).toHaveBeenCalledTimes(2);
    expect(out.clusters).toHaveLength(1);
  });
});

describe("SYSTEM_PROMPT — event vs topic", () => {
  it("states that a cluster is one event and topic is a shared category", () => {
    expect(SYSTEM_PROMPT).toMatch(/one event/i);
    expect(SYSTEM_PROMPT).toMatch(/category/i);
  });
});
