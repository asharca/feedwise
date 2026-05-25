import { describe, it, expect } from "vitest";
import { dedupeArticleAssignments } from "@/lib/digest/consolidate";
import { mergeSameEventClusters } from "@/lib/digest/consolidate";
import type { Cluster } from "@/lib/digest/cluster-types";

const c = (over: Partial<Cluster>): Cluster => ({
  topic: "T", headline: "h", importance: 5, articleIds: ["a"], ...over,
});

describe("dedupeArticleAssignments", () => {
  it("keeps each articleId only in the highest-importance cluster", () => {
    const out = dedupeArticleAssignments([
      c({ topic: "Low", importance: 3, articleIds: ["x", "y"] }),
      c({ topic: "High", importance: 9, articleIds: ["y", "z"] }),
    ]);
    const low = out.find((k) => k.topic === "Low")!;
    const high = out.find((k) => k.topic === "High")!;
    expect(high.articleIds).toEqual(["y", "z"]);
    expect(low.articleIds).toEqual(["x"]);
  });

  it("drops clusters left empty after deduping", () => {
    const out = dedupeArticleAssignments([
      c({ topic: "A", importance: 9, articleIds: ["x"] }),
      c({ topic: "B", importance: 2, articleIds: ["x"] }),
    ]);
    expect(out.map((k) => k.topic)).toEqual(["A"]);
  });
});

describe("mergeSameEventClusters", () => {
  it("merges clusters with same topic and near-identical headline (cross-batch)", () => {
    const out = mergeSameEventClusters([
      c({ topic: "World", headline: "Ceasefire talks resume in capital", importance: 7, articleIds: ["a"] }),
      c({ topic: "world", headline: "Ceasefire talks resume in the capital", importance: 9, articleIds: ["b"] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].articleIds.sort()).toEqual(["a", "b"]);
    expect(out[0].importance).toBe(9);
    expect(out[0].headline).toBe("Ceasefire talks resume in the capital"); // higher-importance wins
  });

  it("keeps distinct events under the same topic separate", () => {
    const out = mergeSameEventClusters([
      c({ topic: "World", headline: "Ceasefire talks resume", importance: 8, articleIds: ["a"] }),
      c({ topic: "World", headline: "Major earthquake hits coast", importance: 8, articleIds: ["b"] }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("merges clusters that share an articleId regardless of headline", () => {
    const out = mergeSameEventClusters([
      c({ topic: "A", headline: "one", importance: 5, articleIds: ["x"] }),
      c({ topic: "B", headline: "two", importance: 5, articleIds: ["x", "y"] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].articleIds.sort()).toEqual(["x", "y"]);
  });
});
