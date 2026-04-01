import { eq, and, desc, gte, ilike, or, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, userArticles, subscriptions, feeds } from "@/lib/db/schema";

export interface ArticleFilter {
  feedId?: string;
  folderId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  since?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getArticles(userId: string, filter: ArticleFilter = {}) {
  const { feedId, unreadOnly, starredOnly, since, search, limit = 50, offset = 0 } = filter;

  // Build base query joining through subscriptions to scope to user's feeds
  const rows = await db
    .select({
      id: articles.id,
      feedId: articles.feedId,
      feedTitle: feeds.title,
      feedIconUrl: feeds.iconUrl,
      url: articles.url,
      title: articles.title,
      author: articles.author,
      summary: articles.summary,
      imageUrl: articles.imageUrl,
      publishedAt: articles.publishedAt,
      isRead: sql<boolean>`coalesce(${userArticles.isRead}, false)`,
      isStarred: sql<boolean>`coalesce(${userArticles.isStarred}, false)`,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, feeds.id),
        eq(subscriptions.userId, userId)
      )
    )
    .leftJoin(
      userArticles,
      and(
        eq(userArticles.articleId, articles.id),
        eq(userArticles.userId, userId)
      )
    )
    .where(
      and(
        feedId ? eq(articles.feedId, feedId) : undefined,
        unreadOnly ? isNull(userArticles.isRead) : undefined,
        starredOnly ? eq(userArticles.isStarred, true) : undefined,
        since ? gte(articles.publishedAt, since) : undefined,
        search
          ? or(
              ilike(articles.title, `%${search}%`),
              ilike(articles.contentText, `%${search}%`)
            )
          : undefined
      )
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function getArticleById(userId: string, articleId: string) {
  const [row] = await db
    .select({
      id: articles.id,
      feedId: articles.feedId,
      feedTitle: feeds.title,
      url: articles.url,
      title: articles.title,
      author: articles.author,
      contentHtml: articles.contentHtml,
      contentText: articles.contentText,
      summary: articles.summary,
      publishedAt: articles.publishedAt,
      isRead: sql<boolean>`coalesce(${userArticles.isRead}, false)`,
      isStarred: sql<boolean>`coalesce(${userArticles.isStarred}, false)`,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, feeds.id),
        eq(subscriptions.userId, userId)
      )
    )
    .leftJoin(
      userArticles,
      and(
        eq(userArticles.articleId, articles.id),
        eq(userArticles.userId, userId)
      )
    )
    .where(eq(articles.id, articleId));

  return row ?? null;
}

export async function markArticle(
  userId: string,
  articleId: string,
  data: { isRead?: boolean; isStarred?: boolean }
) {
  await db
    .insert(userArticles)
    .values({
      userId,
      articleId,
      ...data,
      ...(data.isRead ? { readAt: new Date() } : {}),
    })
    .onConflictDoUpdate({
      target: [userArticles.userId, userArticles.articleId],
      set: {
        ...data,
        ...(data.isRead ? { readAt: new Date() } : {}),
      },
    });
}

export async function searchArticles(userId: string, query: string, limit = 20) {
  return getArticles(userId, { search: query, limit });
}

export async function getTodayArticles(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getArticles(userId, { since: today, limit: 100 });
}

export async function markAllRead(userId: string, feedId?: string) {
  // Get all unread article IDs for this user (optionally scoped to feed)
  const unread = await db
    .select({ id: articles.id })
    .from(articles)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, articles.feedId),
        eq(subscriptions.userId, userId)
      )
    )
    .leftJoin(
      userArticles,
      and(
        eq(userArticles.articleId, articles.id),
        eq(userArticles.userId, userId)
      )
    )
    .where(
      and(
        feedId ? eq(articles.feedId, feedId) : undefined,
        isNull(userArticles.id)
      )
    );

  if (unread.length === 0) return;

  await db
    .insert(userArticles)
    .values(
      unread.map((a) => ({ userId, articleId: a.id, isRead: true, readAt: new Date() }))
    )
    .onConflictDoUpdate({
      target: [userArticles.userId, userArticles.articleId],
      set: { isRead: true, readAt: new Date() },
    });
}
