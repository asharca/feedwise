import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds, subscriptions, folders } from "@/lib/db/schema";


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
      fetchIntervalMinutes: feeds.fetchIntervalMinutes,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(subscriptions.feedId, feeds.id))
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.position);
}

export async function getFolders(userId: string) {
  return db
    .select()
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(folders.position);
}

export async function subscribeFeed(
  userId: string,
  feedUrl: string,
  folderId?: string
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
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, userId)
      )
    );
}

export async function updateSubscription(
  userId: string,
  subscriptionId: string,
  data: { customTitle?: string; folderId?: string | null }
) {
  const [updated] = await db
    .update(subscriptions)
    .set(data)
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, userId)
      )
    )
    .returning();
  return updated;
}

export async function updateFeedInterval(
  userId: string,
  subscriptionId: string,
  intervalMinutes: number
): Promise<{ feedId: string } | null> {
  const [sub] = await db
    .select({ feedId: subscriptions.feedId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, userId)
      )
    );

  if (!sub) return null;

  await db
    .update(feeds)
    .set({ fetchIntervalMinutes: intervalMinutes })
    .where(eq(feeds.id, sub.feedId));

  return { feedId: sub.feedId };
}

export async function updateFeedUrl(
  userId: string,
  subscriptionId: string,
  newUrl: string
): Promise<{ feedId: string; url: string } | null> {
  // Get feedId for this subscription (verify ownership)
  const [sub] = await db
    .select({ feedId: subscriptions.feedId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, userId)
      )
    );

  if (!sub) return null;

  await db
    .update(feeds)
    .set({ url: newUrl, lastFetchedAt: null, lastFetchError: null })
    .where(eq(feeds.id, sub.feedId));

  return { feedId: sub.feedId, url: newUrl };
}
