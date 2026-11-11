// @vitest-environment node
import { describe, expect, it } from "vitest";
import { computeHotItems, type StoredHotRank } from "@/lib/hot/ranks";

const now = new Date("2026-11-12T12:00:00Z");
const before = new Date("2026-11-12T11:40:00Z");
function item(id: string, rank: number, firstSeenAt = before): StoredHotRank {
  return {
    id,
    rank,
    firstSeenAt,
    snapshotId: "latest",
    title: id,
    url: `https://example.com/${id}`,
    heat: null,
    cover: null,
    desc: null,
  };
}

describe("hot rank comparison", () => {
  it("computes rising, falling and unchanged ranks and sorts ascending", () => {
    const result = computeHotItems(
      { id: "latest", capturedAt: now },
      [item("fall", 5), item("rise", 1), item("same", 3)],
      [item("fall", 2), item("rise", 31), item("same", 3)],
    );
    expect(result.map((entry) => [entry.id, entry.rankDelta, entry.isNew])).toEqual([
      ["rise", 30, false],
      ["same", 0, false],
      ["fall", -3, false],
    ]);
    expect(result[0].firstSeenAt).toBe(before.toISOString());
    expect(result[0]).not.toHaveProperty("snapshotId");
  });

  it("distinguishes a newly discovered item from an older returning item", () => {
    const result = computeHotItems(
      { id: "latest", capturedAt: now },
      [item("new", 1, now), item("return", 2)],
      [],
    );
    expect(result.map((entry) => [entry.rankDelta, entry.isNew])).toEqual([
      [null, true],
      [null, false],
    ]);
  });

  it("treats the first snapshot as a baseline, limiting output to rank 30", () => {
    expect(
      computeHotItems(
        { id: "latest", capturedAt: now },
        [item("first", 1, now), item("31", 31, now)],
        null,
      ),
    ).toEqual([expect.objectContaining({ id: "first", isNew: false, rankDelta: null })]);
    expect(computeHotItems({ id: "latest", capturedAt: now }, [], null)).toEqual([]);
  });
});
