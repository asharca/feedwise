import { eq, and, desc, gte, or, isNull, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, userArticles, subscriptions, feeds, tags, articleTags } from "@/lib/db/schema";
import type { ContentView } from "@/lib/db/schema-types";
import { articlePage, type ArticleCursor } from "@/lib/search/article-cursor";

const view = sql<ContentView>`coalesce(${subscriptions.view}, ${feeds.defaultView}, 'article')`;
const visibleState = sql`${userArticles.isHidden} is not true`;

/** Visibility predicate for queries without a user_articles join. */
export function articleIsVisibleTo(userId: string) {
  return sql`not exists (select 1 from ${userArticles}
    where ${userArticles.userId} = ${userId} and ${userArticles.articleId} = ${articles.id}
      and ${userArticles.isHidden})`;
}

type TimeColumn = typeof articles.sortAt | typeof userArticles.readAt;

function cursorTime(column: TimeColumn) {
  return sql<string>`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

function beforeCursor(column: TimeColumn, cursor?: ArticleCursor) {
  return cursor
    ? sql`(${column}, ${articles.id}) < (${cursor.at}::timestamp, ${cursor.id}::uuid)`
    : undefined;
}

const listColumns = {
  id: articles.id,
  feedId: articles.feedId,
  feedTitle: feeds.title,
  feedIconUrl: feeds.iconUrl,
  url: articles.url,
  title: articles.title,
  author: articles.author,
  summary: articles.summary,
  imageUrl: articles.imageUrl,
  media: articles.media,
  view,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  isRead: sql<boolean>`coalesce(${userArticles.isRead}, false)`,
  isStarred: sql<boolean>`coalesce(${userArticles.isStarred}, false)`,
};

export interface ArticleFilter {
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  since?: Date;
  search?: string;
  limit?: number;
  cursor?: ArticleCursor;
  view?: ContentView;
}

export async function getArticles(userId: string, filter: ArticleFilter = {}) {
  const {
    feedId,
    folderId,
    tagId,
    unreadOnly,
    starredOnly,
    since,
    search,
    limit = 50,
    cursor,
    view: filterView,
  } = filter;

  // Build base query joining through subscriptions to scope to user's feeds
  const rows = await db
    .select({
      ...listColumns,
      cursorAt: cursorTime(articles.sortAt),
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .leftJoin(
      userArticles,
      and(eq(userArticles.articleId, articles.id), eq(userArticles.userId, userId)),
    )
    .where(
      and(
        visibleState,
        beforeCursor(articles.sortAt, cursor),
        filterView ? eq(view, filterView) : undefined,
        feedId ? eq(articles.feedId, feedId) : undefined,
        folderId ? eq(subscriptions.folderId, folderId) : undefined,
        tagId
          ? sql`exists (
              select 1 from ${articleTags} at
              where at.article_id = ${articles.id} and at.tag_id = ${tagId}
            )`
          : undefined,
        unreadOnly ? or(isNull(userArticles.isRead), eq(userArticles.isRead, false)) : undefined,
        starredOnly ? eq(userArticles.isStarred, true) : undefined,
        since ? gte(articles.sortAt, since) : undefined,
        search ? sql`${articles.searchTsv} @@ feedwise_search_query(${search})` : undefined,
      ),
    )
    // The feed index uses DESC NULLS LAST; the global index is an ascending
    // sort_at index scanned backwards. Both keys are NOT NULL.
    .orderBy(
      feedId ? sql`${articles.sortAt} desc nulls last` : desc(articles.sortAt),
      feedId ? sql`${articles.id} desc nulls last` : desc(articles.id),
    )
    .limit(limit + 1);

  return articlePage(rows, limit);
}

export interface HistoryFilter {
  search?: string;
  limit?: number;
  cursor?: ArticleCursor;
}

/**
 * Articles the user has read, newest-first by `readAt`. Used by the history
 * view. LEFT JOIN subscriptions so unsubscribing preserves reading history.
 */
export async function getReadingHistory(userId: string, filter: HistoryFilter = {}) {
  const { search, limit = 50, cursor } = filter;

  const rows = await db
    .select({
      ...listColumns,
      cursorAt: cursorTime(userArticles.readAt),
      readAt: userArticles.readAt,
    })
    .from(userArticles)
    .innerJoin(articles, eq(userArticles.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .where(
      and(
        visibleState,
        beforeCursor(userArticles.readAt, cursor),
        eq(userArticles.userId, userId),
        eq(userArticles.isRead, true),
        sql`${userArticles.readAt} is not null`,
        search
          ? sql`(
              ${articles.title} ILIKE ${"%" + search + "%"}
              OR ${feeds.title} ILIKE ${"%" + search + "%"}
            )`
          : undefined,
      ),
    )
    .orderBy(desc(userArticles.readAt), desc(articles.id))
    .limit(limit + 1);

  return articlePage(rows, limit);
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
      media: articles.media,
      view,
      fullContentHtml: articles.fullContentHtml,
      fullContentStatus: articles.fullContentStatus,
      fetchFullText: subscriptions.fetchFullText,
      summary: articles.summary,
      aiSummary: articles.aiSummary,
      importance: articles.importance,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
      isRead: sql<boolean>`coalesce(${userArticles.isRead}, false)`,
      isStarred: sql<boolean>`coalesce(${userArticles.isStarred}, false)`,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .leftJoin(
      userArticles,
      and(eq(userArticles.articleId, articles.id), eq(userArticles.userId, userId)),
    )
    .where(and(eq(articles.id, articleId), visibleState));

  if (!row) return null;

  const articleTagRows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(and(eq(articleTags.articleId, articleId), eq(tags.userId, userId)));

  return { ...row, tags: articleTagRows };
}

export async function removeTagFromArticle(
  userId: string,
  articleId: string,
  tagId: string,
): Promise<boolean> {
  // Verify the tag belongs to the user before unlinking
  const [owned] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
  if (!owned) return false;

  const result = await db
    .delete(articleTags)
    .where(and(eq(articleTags.articleId, articleId), eq(articleTags.tagId, tagId)))
    .returning({ tagId: articleTags.tagId });
  return result.length > 0;
}

export async function getUnsummarizedArticlesForUser(
  userId: string,
  sinceDays: number,
  limit: number,
): Promise<
  Array<{
    id: string;
    title: string | null;
    summary: string | null;
    aiSummary: string | null;
    contentText: string | null;
    contentHtml: string | null;
  }>
> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      aiSummary: articles.aiSummary,
      contentText: articles.contentText,
      contentHtml: articles.contentHtml,
    })
    .from(articles)
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
    )
    .where(
      and(articleIsVisibleTo(userId), gte(articles.createdAt, since), isNull(articles.aiSummary)),
    )
    .orderBy(desc(articles.createdAt))
    .limit(limit);
}

export async function getUntaggedArticlesForUser(
  userId: string,
  sinceDays: number,
  limit: number,
): Promise<
  Array<{
    id: string;
    title: string | null;
    summary: string | null;
    aiSummary: string | null;
    contentText: string | null;
    contentHtml: string | null;
  }>
> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  // Articles that the user is subscribed to AND have no article_tags rows.
  // gte on createdAt (not publishedAt) so historical-pub articles still get
  // enriched when they're newly fetched.
  return db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      aiSummary: articles.aiSummary,
      contentText: articles.contentText,
      contentHtml: articles.contentHtml,
    })
    .from(articles)
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
    )
    .where(
      and(
        articleIsVisibleTo(userId),
        gte(articles.createdAt, since),
        sql`not exists (
          select 1 from ${articleTags} at
          where at.article_id = ${articles.id}
        )`,
      ),
    )
    .orderBy(desc(articles.createdAt))
    .limit(limit);
}

export async function getUserTagsWithCounts(userId: string) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      articleCount: sql<number>`(
        select count(*)::int from ${articleTags} at
        where at.tag_id = ${tags.id}
        and not exists (select 1 from ${userArticles} ua where ua.article_id = at.article_id
          and ua.user_id = ${userId} and ua.is_hidden)
      )`,
    })
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(tags.name);
}

export async function addTagToArticle(
  userId: string,
  articleId: string,
  tagName: string,
): Promise<{ tagId: string; name: string }> {
  const trimmed = tagName.trim().slice(0, 100);
  if (!trimmed) throw new Error("Tag name is required");

  const [tag] = await db
    .insert(tags)
    .values({ userId, name: trimmed })
    .onConflictDoUpdate({ target: [tags.userId, tags.name], set: { name: trimmed } })
    .returning({ id: tags.id, name: tags.name });

  await db.insert(articleTags).values({ articleId, tagId: tag.id }).onConflictDoNothing();

  return { tagId: tag.id, name: tag.name };
}

export async function setArticleAiSummary(articleId: string, aiSummary: string): Promise<void> {
  await db.update(articles).set({ aiSummary }).where(eq(articles.id, articleId));
}

export async function setArticleImportance(
  articleId: string,
  importance: "high" | "med" | "low",
): Promise<void> {
  await db.update(articles).set({ importance }).where(eq(articles.id, articleId));
}

export async function markArticle(
  userId: string,
  articleId: string,
  data: { isRead?: boolean; isStarred?: boolean; readProgress?: number },
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
      setWhere: visibleState,
    });
}

export async function searchArticles(userId: string, query: string, limit = 20) {
  return (await getArticles(userId, { search: query, limit })).items;
}

export async function getTodayArticles(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (await getArticles(userId, { since: today, limit: 100 })).items;
}

export async function getArticlesGroupedByFolder(userId: string, limit = 6) {
  // Get articles with their folder info, grouped by folder
  const rows = await db
    .select({
      ...listColumns,
      folderId: subscriptions.folderId,
      folderName: sql<string | null>`(
        select f.name from folders f where f.id = ${subscriptions.folderId}
      )`,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .leftJoin(
      userArticles,
      and(eq(userArticles.articleId, articles.id), eq(userArticles.userId, userId)),
    )
    .where(visibleState)
    .orderBy(desc(articles.sortAt), desc(articles.id))
    .limit(200);

  // Group by folder
  const grouped = new Map<string, { folderName: string; articles: typeof rows }>();
  const uncategorized: typeof rows = [];

  for (const row of rows) {
    if (row.folderId && row.folderName) {
      const key = row.folderId;
      if (!grouped.has(key)) {
        grouped.set(key, { folderName: row.folderName, articles: [] });
      }
      const group = grouped.get(key)!;
      if (group.articles.length < limit) {
        group.articles.push(row);
      }
    } else {
      if (uncategorized.length < limit) {
        uncategorized.push(row);
      }
    }
  }

  const result: { folderId: string | null; folderName: string; articles: typeof rows }[] = [];

  for (const [folderId, group] of grouped) {
    result.push({ folderId, folderName: group.folderName, articles: group.articles });
  }

  if (uncategorized.length > 0) {
    result.push({ folderId: null, folderName: "Uncategorized", articles: uncategorized });
  }

  return result;
}

/** Look up an article's destination URL by id (no user scoping). */
export async function getArticleUrlById(articleId: string): Promise<string | null> {
  const [row] = await db
    .select({ url: articles.url })
    .from(articles)
    .where(eq(articles.id, articleId));
  return row?.url ?? null;
}

/** Fetch the content fields the LLM tagging prompt needs, by article id. */
export async function getEnrichableArticlesByIds(articleIds: string[]): Promise<
  Array<{
    id: string;
    title: string | null;
    summary: string | null;
    aiSummary: string | null;
    contentText: string | null;
    contentHtml: string | null;
  }>
> {
  if (articleIds.length === 0) return [];
  return db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      aiSummary: articles.aiSummary,
      contentText: articles.contentText,
      contentHtml: articles.contentHtml,
    })
    .from(articles)
    .where(inArray(articles.id, articleIds));
}

export async function markAllRead(userId: string, feedId?: string, folderId?: string) {
  // Get all unread article IDs for this user (optionally scoped to feed or folder)
  const unread = await db
    .select({ id: articles.id })
    .from(articles)
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, articles.feedId), eq(subscriptions.userId, userId)),
    )
    .leftJoin(
      userArticles,
      and(eq(userArticles.articleId, articles.id), eq(userArticles.userId, userId)),
    )
    .where(
      and(
        feedId ? eq(articles.feedId, feedId) : undefined,
        folderId ? eq(subscriptions.folderId, folderId) : undefined,
        visibleState,
        sql`${userArticles.isRead} is not true`,
      ),
    );

  if (unread.length === 0) return;

  await db
    .insert(userArticles)
    .values(unread.map((a) => ({ userId, articleId: a.id, isRead: true, readAt: new Date() })))
    .onConflictDoUpdate({
      target: [userArticles.userId, userArticles.articleId],
      set: { isRead: true, readAt: new Date() },
      setWhere: visibleState,
    });
}
