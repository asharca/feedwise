import { describe, expect, it } from "vitest";
import type { ArticleCardItem } from "@/components/article/article-card";
import {
  buildDateGroupedVirtualRows,
  buildFlatVirtualRows,
  estimateVirtualRowSize,
} from "@/components/article/virtual-rows";

function makeItem(id: string, view: ArticleCardItem["view"] = "article"): ArticleCardItem {
  return {
    id,
    feedTitle: "Feed",
    feedIconUrl: null,
    title: `Title ${id}`,
    view,
  };
}

describe("buildDateGroupedVirtualRows", () => {
  it("emits headers and single-item rows when columns = 1", () => {
    const result = buildDateGroupedVirtualRows(
      [
        { key: "2026-11-21", label: "今天", rows: [makeItem("a1"), makeItem("a2")] },
        { key: "2026-11-20", label: "昨天", rows: [makeItem("a3")] },
      ],
      1,
    );

    expect(result.rows.map((r) => r.kind)).toEqual(["header", "item", "item", "header", "item"]);
    expect(result.articleRowIndex.get("a1")).toBe(1);
    expect(result.articleRowIndex.get("a2")).toBe(2);
    expect(result.articleRowIndex.get("a3")).toBe(4);
  });

  it("chunks grid items by column count while keeping audio items as full-width rows", () => {
    const result = buildDateGroupedVirtualRows(
      [
        {
          key: "2026-11-21",
          label: "今天",
          rows: [
            makeItem("a1", "article"),
            makeItem("a2", "picture"),
            makeItem("a3", "video"),
            makeItem("a4", "audio"),
            makeItem("a5", "social"),
          ],
        },
      ],
      2,
    );

    expect(result.rows.map((r) => r.kind)).toEqual([
      "header",
      "grid-row",
      "grid-row",
      "item",
      "grid-row",
    ]);
    expect(result.articleRowIndex.get("a1")).toBe(1);
    expect(result.articleRowIndex.get("a2")).toBe(1);
    expect(result.articleRowIndex.get("a3")).toBe(2);
    expect(result.articleRowIndex.get("a4")).toBe(3);
    expect(result.articleRowIndex.get("a5")).toBe(4);
  });
});

describe("buildFlatVirtualRows & estimateVirtualRowSize", () => {
  it("chunks ungrouped items into grid rows and returns positive size estimates", () => {
    const result = buildFlatVirtualRows(
      [makeItem("a1", "picture"), makeItem("a2", "picture"), makeItem("a3", "picture")],
      2,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].kind).toBe("grid-row");
    expect(result.rows[1].kind).toBe("grid-row");
    for (const row of result.rows) {
      expect(estimateVirtualRowSize(row)).toBeGreaterThan(0);
    }
  });
});
