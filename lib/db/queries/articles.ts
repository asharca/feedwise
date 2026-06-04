import { eq, and, desc, gte, or, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, userArticles, subscriptions, feeds, tags, articleTags } from "@/lib/db/schema";

export interface ArticleFilter {
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  since?: Date;
  search?: string;
  limit?: number;
  offset?: number;
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
    offset = 0,
  } = filter;

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
    .where(
      and(
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
        since
          ? sql`coalesce(${articles.publishedAt}, ${articles.createdAt}) >= ${since}`
          : undefined,
        // Broader full-text search: cover title + body + RSS summary + AI
        // summary, and fall back to a case-insensitive substring match on the
        // title so short queries like "AI" and partial words still resolve.
        // `websearch_to_tsquery` is more forgiving than plainto_tsquery
        // (handles quotes, OR, multi-word naturally).
        search
          ? sql`(
              to_tsvector('simple',
                coalesce(${articles.title}, '') || ' ' ||
                coalesce(${articles.contentText}, '') || ' ' ||
                coalesce(${articles.summary}, '') || ' ' ||
                coalesce(${articles.aiSummary}, '')
              ) @@ websearch_to_tsquery('simple', ${search})
              OR ${articles.title} ILIKE ${"%" + search + "%"}
            )`
          : undefined,
      ),
    )
    // Sort by article time, falling back to fetch time so articles missing a
    // pubdate (common with hand-rolled feeds) still get a sensible position
    // instead of either piling at the top (NULLS FIRST) or vanishing (NULLS LAST).
    .orderBy(sql`coalesce(${articles.publishedAt}, ${articles.createdAt}) desc`)
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
    .where(eq(articles.id, articleId));

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
    .where(and(gte(articles.createdAt, since), isNull(articles.aiSummary)))
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

export async function getArticlesGroupedByFolder(userId: string, limit = 6) {
  // Get articles with their folder info, grouped by folder
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
      createdAt: articles.createdAt,
      isRead: sql<boolean>`coalesce(${userArticles.isRead}, false)`,
      isStarred: sql<boolean>`coalesce(${userArticles.isStarred}, false)`,
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
    .orderBy(sql`coalesce(${articles.publishedAt}, ${articles.createdAt}) desc`)
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
        isNull(userArticles.id),
      ),
    );

  if (unread.length === 0) return;

  await db
    .insert(userArticles)
    .values(unread.map((a) => ({ userId, articleId: a.id, isRead: true, readAt: new Date() })))
    .onConflictDoUpdate({
      target: [userArticles.userId, userArticles.articleId],
      set: { isRead: true, readAt: new Date() },
    });
}
