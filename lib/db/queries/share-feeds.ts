import { and, desc, eq, exists, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  articles,
  articleTags,
  feeds,
  shareFeeds,
  subscriptions,
  tags,
  userArticles,
} from "@/lib/db/schema";
import type { ShareFeedFilter } from "@/lib/db/schema-types";
import type { RssArticle } from "@/lib/share/rss";

const owned = (userId: string, id: string) =>
  and(eq(shareFeeds.userId, userId), eq(shareFeeds.id, id));

export function listShareFeeds(userId: string) {
  return db
    .select()
    .from(shareFeeds)
    .where(eq(shareFeeds.userId, userId))
    .orderBy(desc(shareFeeds.createdAt));
}

export async function createShareFeed(
  userId: string,
  name: string,
  filter: ShareFeedFilter,
  token: string,
) {
  return (await db.insert(shareFeeds).values({ userId, name, filter, token }).returning())[0];
}

export async function updateShareFeed(
  userId: string,
  id: string,
  data: { token?: string; name?: string; filter?: ShareFeedFilter },
) {
  return (await db.update(shareFeeds).set(data).where(owned(userId, id)).returning())[0];
}

export async function deleteShareFeed(userId: string, id: string) {
  return (await db.delete(shareFeeds).where(owned(userId, id)).returning({ id: shareFeeds.id }))[0];
}

export async function findPublicShare(token: string) {
  return (await db.select().from(shareFeeds).where(eq(shareFeeds.token, token)))[0];
}

export async function sharedArticles(
  userId: string,
  filter: ShareFeedFilter,
): Promise<RssArticle[]> {
  return db
    .select({
      id: articles.id,
      title: sql<string>`coalesce(${articles.title}, ${articles.url}, '')`,
      url: articles.url,
      content: articles.contentHtml,
      summary: sql<string | null>`coalesce(${articles.summary}, ${articles.contentText})`,
      published: articles.sortAt,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(subscriptions.feedId, feeds.id))
    .innerJoin(articles, eq(articles.feedId, feeds.id))
    .leftJoin(
      userArticles,
      and(eq(userArticles.userId, subscriptions.userId), eq(userArticles.articleId, articles.id)),
    )
    .where(
      and(
        eq(subscriptions.userId, userId),
        sql`${userArticles.isHidden} is not true`,
        filter.feedId ? eq(feeds.id, filter.feedId) : undefined,
        filter.folderId ? eq(subscriptions.folderId, filter.folderId) : undefined,
        filter.tagId
          ? exists(
              db
                .select({ id: tags.id })
                .from(articleTags)
                .innerJoin(tags, eq(tags.id, articleTags.tagId))
                .where(
                  and(
                    eq(articleTags.articleId, articles.id),
                    eq(tags.id, filter.tagId),
                    eq(tags.userId, userId),
                  ),
                ),
            )
          : undefined,
        filter.starred !== undefined
          ? sql`coalesce(${userArticles.isStarred}, false) = ${filter.starred}`
          : undefined,
        filter.view
          ? sql`coalesce(${subscriptions.view}, ${feeds.defaultView}, 'article') = ${filter.view}`
          : undefined,
      ),
    )
    .orderBy(desc(articles.sortAt), desc(articles.id))
    .limit(50);
}
