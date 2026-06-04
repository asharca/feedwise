import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { organize } from "@/lib/digest/organize";
import type { DedupedArticle } from "@/lib/digest/types";
import type { ClusterResponse } from "@/lib/digest/cluster-types";

function ded(id: string, title: string): DedupedArticle {
  return {
    primary: {
      id,
      title,
      url: `https://e.com/${id}`,
      summary: `s ${title}`,
      aiSummary: null,
      importance: null,
      feedTitle: "feed",
      feedId: "00000000-0000-4000-a000-000000000001",
      publishedAt: new Date("2026-05-25T00:00:00Z"),
      tags: [],
    },
    duplicates: [],
  };
}

const uuid = (n: number) => `f47ac10b-58cc-4372-a567-${String(n).padStart(12, "0")}`;

function art(id: string): DedupedArticle {
  return {
    primary: {
      id,
      title: `T-${id.slice(-3)}`,
      url: `https://e.com/${id}`,
      summary: null,
      aiSummary: null,
      importance: null,
      feedTitle: "f",
      feedId: "00000000-0000-4000-a000-000000000001",
      publishedAt: new Date(),
      tags: [],
    },
    duplicates: [],
  };
}

describe("organize", () => {
  it("invariant: every input article appears exactly once in output (property test)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 6 }),
        (nArticles, nClusters) => {
          const deduped = Array.from({ length: nArticles }, (_, i) => art(uuid(i)));
          const ids = deduped.map((d) => d.primary.id);
          const clusters = Array.from({ length: Math.min(nClusters, nArticles) }, (_, k) => ({
            topic: `T${k}`,
            headline: `h${k}`,
            importance: ((k * 3) % 10) + 1,
            articleIds: ids.filter((_, i) => i % nClusters === k % nClusters),
          })).filter((c) => c.articleIds.length > 0);
          const resp: ClusterResponse = { clusters };
          const out = organize(deduped, resp);
          const seen = new Set<string>();
          for (const h of out.topHeadlines) seen.add(h.primaryArticle.id);
          for (const g of out.topicGroups) {
            for (const c of g.clusters) {
              seen.add(c.primary.id);
              for (const d of c.duplicates) seen.add(d.id);
            }
          }
          for (const a of out.ungrouped) seen.add(a.id);
          expect(seen.size).toBe(nArticles);
          for (const id of ids) expect(seen.has(id)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("Top headlines are fixed at 5 (padded by importance)", () => {
    const deduped = Array.from({ length: 7 }, (_, i) => art(uuid(i)));
    const resp: ClusterResponse = {
      clusters: deduped.map((d, i) => ({
        topic: "T",
        headline: `h${i}`,
        importance: 9 - i,
        articleIds: [d.primary.id],
      })),
    };
    const out = organize(deduped, resp);
    expect(out.topHeadlines).toHaveLength(5);
    const imps = out.topHeadlines.map((h) => h.cluster.importance);
    expect(imps).toEqual([...imps].sort((a, b) => b - a));
  });

  it("returns fewer than 5 only if fewer clusters exist", () => {
    const deduped = [art(uuid(1)), art(uuid(2))];
    const resp: ClusterResponse = {
      clusters: [
        { topic: "A", headline: "h", importance: 9, articleIds: [uuid(1)] },
        { topic: "B", headline: "h", importance: 5, articleIds: [uuid(2)] },
      ],
    };
    const out = organize(deduped, resp);
    expect(out.topHeadlines).toHaveLength(2);
  });

  it("articles missing from clusters go to ungrouped", () => {
    const deduped = [art(uuid(1)), art(uuid(2)), art(uuid(3))];
    const resp: ClusterResponse = {
      clusters: [{ topic: "T", headline: "h", importance: 8, articleIds: [uuid(1)] }],
    };
    const out = organize(deduped, resp);
    expect(out.ungrouped.map((a) => a.id).sort()).toEqual([uuid(2), uuid(3)].sort());
  });

  it("mode = 'clustered' when clusters are provided", () => {
    const deduped = [art(uuid(1))];
    const out = organize(deduped, {
      clusters: [{ topic: "T", headline: "h", importance: 5, articleIds: [uuid(1)] }],
    });
    expect(out.mode).toBe("clustered");
  });
});

describe("organize — multiple events per topic", () => {
  it("renders each event as its own cluster within a topic group", () => {
    const a = "11111111-1111-4111-a111-000000000001";
    const b = "11111111-1111-4111-a111-000000000002";
    const deduped = [ded(a, "Ceasefire talks resume"), ded(b, "Earthquake hits coast")];
    const response = {
      clusters: [
        { topic: "World", headline: "Ceasefire talks resume", importance: 9, articleIds: [a] },
        { topic: "World", headline: "Earthquake hits coast", importance: 8, articleIds: [b] },
      ],
    };
    const digest = organize(deduped, response);
    const world = digest.topicGroups.find((g) => g.topic === "World")!;
    expect(world.clusters).toHaveLength(2); // two distinct events, NOT one + duplicate
    expect(world.clusters.every((cl) => cl.duplicates.length === 0)).toBe(true);
  });
});
