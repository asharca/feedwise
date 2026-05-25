import { describe, it, expect } from "vitest";
import { dedupeArticleAssignments } from "@/lib/digest/consolidate";
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
