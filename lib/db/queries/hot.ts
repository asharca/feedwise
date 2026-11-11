import { asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { hotItems, hotRanks, hotSnapshots, hotSources } from "@/lib/db/schema";
import type { NormalizedHotItem } from "@/lib/hot/types";

export interface HotBoardData {
  states: Array<typeof hotSources.$inferSelect>;
  snapshots: Array<typeof hotSnapshots.$inferSelect & { position: number }>;
  ranks: Array<
    Pick<typeof hotItems.$inferSelect, "id" | "title" | "url" | "firstSeenAt" | "cover" | "desc"> &
      Pick<typeof hotRanks.$inferSelect, "snapshotId" | "rank" | "heat">
  >;
}

export async function saveHotSnapshot(
  sourceKey: string,
  items: NormalizedHotItem[],
  capturedAt: Date,
) {
  return db.transaction(async (tx) => {
    // This row lock also serializes concurrent writes for the same source.
    await tx
      .insert(hotSources)
      .values({ key: sourceKey })
      .onConflictDoUpdate({ target: hotSources.key, set: { key: sourceKey } });
    const [snapshot] = await tx.insert(hotSnapshots).values({ sourceKey, capturedAt }).returning();
    if (items.length > 0) {
      const stored = await tx
        .insert(hotItems)
        .values(
          items.map((item) => ({
            sourceKey,
            itemKey: item.itemKey,
            title: item.title,
            url: item.url,
            cover: item.cover,
            desc: item.desc,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            peakRank: item.rank,
          })),
        )
        .onConflictDoUpdate({
          target: [hotItems.sourceKey, hotItems.itemKey],
          set: {
            title: sql`excluded.title`,
            url: sql`excluded.url`,
            cover: sql`excluded.cover`,
            desc: sql`excluded."desc"`,
            lastSeenAt: capturedAt,
            peakRank: sql`least(${hotItems.peakRank}, excluded.peak_rank)`,
          },
        })
        .returning({ id: hotItems.id, itemKey: hotItems.itemKey });
      const ids = new Map(stored.map((item) => [item.itemKey, item.id]));
      await tx.insert(hotRanks).values(
        items.map((item) => ({
          snapshotId: snapshot.id,
          itemId: ids.get(item.itemKey)!,
          rank: item.rank,
          heat: item.heat,
        })),
      );
    }
    await tx
      .update(hotSources)
      .set({
        lastFetchedAt: capturedAt,
        lastError: null,
        consecutiveFailures: 0,
      })
      .where(eq(hotSources.key, sourceKey));
    return { itemCount: items.length };
  });
}

export async function recordHotFailure(sourceKey: string, error: string, attemptedAt: Date) {
  await db
    .insert(hotSources)
    .values({
      key: sourceKey,
      lastFetchedAt: attemptedAt,
      lastError: error,
      consecutiveFailures: 1,
    })
    .onConflictDoUpdate({
      target: hotSources.key,
      set: {
        lastFetchedAt: attemptedAt,
        lastError: error,
        consecutiveFailures: sql`${hotSources.consecutiveFailures} + 1`,
      },
    });
}

export async function getHotSourceStates() {
  return db.select().from(hotSources);
}

export async function pruneHotHistory(now = new Date()) {
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60_000);
  await db.transaction(async (tx) => {
    await tx.delete(hotSnapshots).where(lt(hotSnapshots.capturedAt, cutoff));
    await tx.delete(hotItems).where(lt(hotItems.lastSeenAt, cutoff));
  });
}

export async function readHotBoards(sourceKeys: string[]): Promise<HotBoardData> {
  return db.transaction(
    async (tx) => {
      const states = await tx.select().from(hotSources).where(inArray(hotSources.key, sourceKeys));
      const rankedSnapshots = tx
        .select({
          id: hotSnapshots.id,
          sourceKey: hotSnapshots.sourceKey,
          capturedAt: hotSnapshots.capturedAt,
          position:
            sql<number>`row_number() over (partition by ${hotSnapshots.sourceKey} order by ${hotSnapshots.capturedAt} desc, ${hotSnapshots.id} desc)`.as(
              "position",
            ),
        })
        .from(hotSnapshots)
        .where(inArray(hotSnapshots.sourceKey, sourceKeys))
        .as("ranked_snapshots");
      const snapshots = await tx
        .select()
        .from(rankedSnapshots)
        .where(lte(rankedSnapshots.position, 2))
        .orderBy(
          asc(rankedSnapshots.sourceKey),
          desc(rankedSnapshots.capturedAt),
          desc(rankedSnapshots.id),
        );
      const snapshotIds = snapshots.map((snapshot) => snapshot.id);
      const ranks =
        snapshotIds.length === 0
          ? []
          : await tx
              .select({
                snapshotId: hotRanks.snapshotId,
                id: hotItems.id,
                title: hotItems.title,
                url: hotItems.url,
                rank: hotRanks.rank,
                heat: hotRanks.heat,
                firstSeenAt: hotItems.firstSeenAt,
                cover: hotItems.cover,
                desc: hotItems.desc,
              })
              .from(hotRanks)
              .innerJoin(hotItems, eq(hotItems.id, hotRanks.itemId))
              .where(inArray(hotRanks.snapshotId, snapshotIds))
              .orderBy(asc(hotRanks.rank));
      return { states, snapshots, ranks };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
