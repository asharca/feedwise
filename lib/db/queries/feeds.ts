import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds, subscriptions, folders, articles, userArticles } from "@/lib/db/schema";

export async function getSubscriptions(userId: string) {
  return db
    .select({
      id: subscriptions.id,
      feedId: feeds.id,
      url: feeds.url,
      title: subscriptions.customTitle,
      feedTitle: feeds.title,
      siteUrl: feeds.siteUrl,
      iconUrl: feeds.iconUrl,
      folderId: subscriptions.folderId,
      position: subscriptions.position,
      lastFetchedAt: feeds.lastFetchedAt,
      lastFetchError: feeds.lastFetchError,
      errorCode: feeds.errorCode,
      consecutiveFailures: feeds.consecutiveFailures,
      fetchIntervalMinutes: feeds.fetchIntervalMinutes,
      unreadCount: sql<number>`(
        select count(*)::int from ${articles} a
        left join ${userArticles} ua
          on ua.article_id = a.id and ua.user_id = ${userId}
        where a.feed_id = ${feeds.id}
          and (ua.is_read is null or ua.is_read = false)
      )`,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(subscriptions.feedId, feeds.id))
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.position);
}

export async function getFolders(userId: string) {
  return db.select().from(folders).where(eq(folders.userId, userId)).orderBy(folders.position);
}

export async function getFeedFromSubscription(
  userId: string,
  subscriptionId: string,
): Promise<{ feedId: string; url: string } | null> {
  const [row] = await db
    .select({ feedId: feeds.id, url: feeds.url })
    .from(subscriptions)
    .innerJoin(feeds, eq(subscriptions.feedId, feeds.id))
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));
  return row ?? null;
}

export async function findFeedByUrl(url: string) {
  const [feed] = await db
    .select({
      id: feeds.id,
      url: feeds.url,
      lastFetchedAt: feeds.lastFetchedAt,
    })
    .from(feeds)
    .where(eq(feeds.url, url));
  return feed ?? null;
}

export async function subscribeFeed(
  userId: string,
  feedUrl: string,
  folderId?: string,
): Promise<{ feedId: string; subscriptionId: string }> {
  // Upsert the global feed record
  const [feed] = await db
    .insert(feeds)
    .values({ url: feedUrl })
    .onConflictDoUpdate({ target: feeds.url, set: { url: feedUrl } })
    .returning({ id: feeds.id });

  // Create user subscription
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId, feedId: feed.id, folderId })
    .onConflictDoNothing()
    .returning({ id: subscriptions.id });

  return { feedId: feed.id, subscriptionId: sub?.id ?? "" };
}

export async function unsubscribeFeed(userId: string, subscriptionId: string) {
  await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));
}

export async function updateSubscription(
  userId: string,
  subscriptionId: string,
  data: { customTitle?: string; folderId?: string | null },
) {
  const [updated] = await db
    .update(subscriptions)
    .set(data)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)))
    .returning();
  return updated;
}

export async function updateFeedInterval(
  userId: string,
  subscriptionId: string,
  intervalMinutes: number,
): Promise<{ feedId: string } | null> {
  const [sub] = await db
    .select({ feedId: subscriptions.feedId })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));

  if (!sub) return null;

  await db
    .update(feeds)
    .set({ fetchIntervalMinutes: intervalMinutes })
    .where(eq(feeds.id, sub.feedId));

  return { feedId: sub.feedId };
}

export async function createFolder(userId: string, name: string, parentId?: string) {
  const [folder] = await db.insert(folders).values({ userId, name, parentId }).returning();
  return folder;
}

export async function updateFolder(
  userId: string,
  folderId: string,
  data: { name?: string; parentId?: string | null },
): Promise<{ id: string; name: string } | null> {
  const updates: { name?: string; parentId?: string | null } = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.parentId !== undefined) updates.parentId = data.parentId;
  if (Object.keys(updates).length === 0) return null;

  const [folder] = await db
    .update(folders)
    .set(updates)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning({ id: folders.id, name: folders.name });
  return folder ?? null;
}

export async function deleteFolder(userId: string, folderId: string): Promise<boolean> {
  // Detach child folders (promote them to root) so we don't hit FK constraints.
  await db
    .update(folders)
    .set({ parentId: null })
    .where(and(eq(folders.parentId, folderId), eq(folders.userId, userId)));

  // subscriptions.folderId has ON DELETE SET NULL, so feeds become uncategorised
  const result = await db
    .delete(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning({ id: folders.id });
  return result.length > 0;
}

export async function reorderFolders(userId: string, folderIds: string[]): Promise<void> {
  if (folderIds.length === 0) return;
  // Run sequentially in a single transaction to keep positions consistent.
  await db.transaction(async (tx) => {
    for (let i = 0; i < folderIds.length; i++) {
      await tx
        .update(folders)
        .set({ position: i })
        .where(and(eq(folders.id, folderIds[i]), eq(folders.userId, userId)));
    }
  });
}

export async function reorderSubscriptions(
  userId: string,
  subscriptionIds: string[],
): Promise<void> {
  if (subscriptionIds.length === 0) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < subscriptionIds.length; i++) {
      await tx
        .update(subscriptions)
        .set({ position: i })
        .where(and(eq(subscriptions.id, subscriptionIds[i]), eq(subscriptions.userId, userId)));
    }
  });
}

export async function getSubscriptionsForGrouping(userId: string) {
  return db
    .select({
      id: feeds.id,
      title: feeds.title,
      description: feeds.description,
      siteUrl: feeds.siteUrl,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(subscriptions.feedId, feeds.id))
    .where(eq(subscriptions.userId, userId));
}

/**
 * Apply an AI-proposed folder layout to the user's subscriptions. Folders
 * that already exist (by name) are reused; missing ones are created.
 * Subscriptions matching a feedId in a proposed folder have their folderId
 * reassigned. Feeds not mentioned in the proposal are left untouched.
 */
export async function applyFolderProposal(
  userId: string,
  proposed: Array<{ name: string; feedIds: string[] }>,
): Promise<{ foldersTouched: number; subscriptionsMoved: number }> {
  let foldersTouched = 0;
  let subscriptionsMoved = 0;

  for (const p of proposed) {
    const trimmed = p.name.trim();
    if (!trimmed || p.feedIds.length === 0) continue;
    const folder = await getOrCreateFolder(userId, trimmed);
    foldersTouched++;
    const result = await db
      .update(subscriptions)
      .set({ folderId: folder.id })
      .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.feedId, p.feedIds)))
      .returning({ id: subscriptions.id });
    subscriptionsMoved += result.length;
  }

  return { foldersTouched, subscriptionsMoved };
}

export async function getOrCreateFolder(userId: string, name: string) {
  // Use upsert to avoid TOCTOU race condition
  const [folder] = await db
    .insert(folders)
    .values({ userId, name })
    .onConflictDoUpdate({
      target: [folders.userId, folders.name],
      set: { name },
    })
    .returning();
  return folder;
}

export async function updateFeedUrl(
  userId: string,
  subscriptionId: string,
  newUrl: string,
): Promise<{ feedId: string; url: string } | null> {
  // Get feedId for this subscription (verify ownership)
  const [sub] = await db
    .select({ feedId: subscriptions.feedId })
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));

  if (!sub) return null;

  await db
    .update(feeds)
    .set({
      url: newUrl,
      lastFetchedAt: null,
      lastFetchError: null,
      errorCode: null,
      consecutiveFailures: 0,
    })
    .where(eq(feeds.id, sub.feedId));

  return { feedId: sub.feedId, url: newUrl };
}
