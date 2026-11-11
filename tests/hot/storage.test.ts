// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  values: [] as Array<{ table: unknown; values: unknown }>,
  conflicts: [] as Array<{ table: unknown; set: Record<string, unknown> }>,
  updates: [] as Array<{ table: unknown; set: unknown }>,
}));
vi.mock("@/lib/db", () => ({ db: { transaction: h.transaction, insert: h.insert } }));
import { hotItems, hotRanks, hotSnapshots, hotSources } from "@/lib/db/schema";
import { recordHotFailure, saveHotSnapshot } from "@/lib/db/queries/hot";

beforeEach(() => {
  h.values.length = 0;
  h.conflicts.length = 0;
  h.updates.length = 0;
  h.insert.mockReset();
  h.update.mockReset();
  h.transaction.mockReset();
  h.transaction.mockImplementation(async (fn) => fn({ insert: h.insert, update: h.update }));
  h.insert.mockImplementation((table) => ({
    values: (values: unknown) => {
      h.values.push({ table, values });
      return {
        returning: async () => (table === hotSnapshots ? [{ id: "snapshot" }] : []),
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
          h.conflicts.push({ table, set });
          return { returning: async () => [{ id: "item", itemKey: "https://example.com" }] };
        },
      };
    },
  }));
  h.update.mockImplementation((table) => ({
    set: (set: unknown) => {
      h.updates.push({ table, set });
      return { where: async () => undefined };
    },
  }));
});

const now = new Date("2026-11-12T00:00:00Z");
const item = {
  itemKey: "https://example.com",
  title: "事件",
  url: "https://example.com",
  rank: 2,
  heat: 9876543210,
  cover: null,
  desc: null,
};

describe("hot transactional storage", () => {
  it("stores snapshot, items and ranks atomically and resets source failures", async () => {
    expect(await saveHotSnapshot("zhihu", [item], now)).toEqual({ itemCount: 1 });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.values).toEqual([
      { table: hotSources, values: { key: "zhihu" } },
      { table: hotSnapshots, values: { sourceKey: "zhihu", capturedAt: now } },
      {
        table: hotItems,
        values: [expect.objectContaining({ firstSeenAt: now, lastSeenAt: now, peakRank: 2 })],
      },
      {
        table: hotRanks,
        values: [{ snapshotId: "snapshot", itemId: "item", rank: 2, heat: 9876543210 }],
      },
    ]);
    expect(h.updates).toEqual([
      { table: hotSources, set: { lastFetchedAt: now, lastError: null, consecutiveFailures: 0 } },
    ]);
    const conflict = h.conflicts.find((entry) => entry.table === hotItems)!;
    expect(conflict.set).not.toHaveProperty("firstSeenAt");
    const dialect = new PgDialect();
    expect(
      dialect.sqlToQuery(conflict.set.peakRank as Parameters<typeof dialect.sqlToQuery>[0]).sql,
    ).toContain("least(");
  });

  it("upserts failed source attempts and increments an existing failure count", async () => {
    await recordHotFailure("weibo", "失败", now);
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.values).toEqual([
      {
        table: hotSources,
        values: { key: "weibo", lastFetchedAt: now, lastError: "失败", consecutiveFailures: 1 },
      },
    ]);
    const dialect = new PgDialect();
    const increment = h.conflicts[0].set.consecutiveFailures as Parameters<
      typeof dialect.sqlToQuery
    >[0];
    expect(dialect.sqlToQuery(increment).sql).toBe('"hot_sources"."consecutive_failures" + 1');
  });

  it("records empty snapshots without inserting invalid empty value lists", async () => {
    expect(await saveHotSnapshot("zhihu", [], now)).toEqual({ itemCount: 0 });
    expect(h.values.map((entry) => entry.table)).toEqual([hotSources, hotSnapshots]);
    expect(h.updates[0].set).toMatchObject({ lastError: null, consecutiveFailures: 0 });
  });
});
