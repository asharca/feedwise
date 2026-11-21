import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, articleTags, feeds, subscriptions, tags, userArticles } from "@/lib/db/schema";
import {
  parseSnippet,
  SNIPPET_START,
  SNIPPET_END,
  type SnippetPart,
} from "@/lib/search/parse-snippet";
import { hasCjk, highlightSubstring } from "@/lib/search/highlight";

const HEADLINE_OPTIONS_BODY = `StartSel=${SNIPPET_START}, StopSel=${SNIPPET_END}, MaxFragments=2, MaxWords=15, MinWords=5`;
const HEADLINE_OPTIONS_TITLE = `StartSel=${SNIPPET_START}, StopSel=${SNIPPET_END}, MaxFragments=1, MaxWords=20, MinWords=5`;

export interface SearchArticleOpts {
  q: string;
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  since?: Date;
  limit?: number;
}

export interface ArticleHit {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  titleParts: SnippetPart[];
  snippetParts: SnippetPart[];
  isRead: boolean;
  isStarred: boolean;
  publishedAt: Date | null;
}

export async function searchArticles(
  userId: string,
  opts: SearchArticleOpts,
): Promise<ArticleHit[]> {
  const { q, feedId, folderId, tagId, unreadOnly, starredOnly, since } = opts;
  const limit = Math.min(opts.limit ?? 5, 20);

  const tsq = sql`feedwise_search_query(${q})`;
  const headlineQuery = sql`websearch_to_tsquery('simple', ${q})`;
  const cjk = hasCjk(q);
  const body = sql`coalesce(${articles.contentText}, ${articles.summary}, ${articles.aiSummary}, '')`;

  const rows = await db
    .select({
      id: articles.id,
      feedId: articles.feedId,
      feedTitle: feeds.title,
      feedIconUrl: feeds.iconUrl,
      title: articles.title,
      rawTitle: cjk
        ? articles.title
        : sql<string>`ts_headline('simple', coalesce(${articles.title}, ''), ${headlineQuery}, ${HEADLINE_OPTIONS_TITLE})`,
      rawSnippet: cjk
        ? sql<string>`concat_ws(' ', ${articles.aiSummary}, ${articles.summary}, left(${articles.contentText}, 20000))`
        : sql<string>`ts_headline('simple', ${body}, ${headlineQuery}, ${HEADLINE_OPTIONS_BODY})`,
      publishedAt: articles.publishedAt,
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
        since ? sql`${articles.sortAt} >= ${since.toISOString()}` : undefined,
        sql`${userArticles.isHidden} is not true`,
        sql`${articles.searchTsv} @@ ${tsq}`,
      ),
    )
    .orderBy(
      sql`ts_rank_cd(${articles.searchTsv}, ${tsq}) desc, ${articles.sortAt} desc, ${articles.id} desc`,
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    feedId: r.feedId,
    feedTitle: r.feedTitle,
    feedIconUrl: r.feedIconUrl,
    title: r.title,
    titleParts: cjk ? highlightSubstring(r.rawTitle ?? "", q) : parseSnippet(r.rawTitle),
    snippetParts: cjk ? highlightSubstring(r.rawSnippet, q) : parseSnippet(r.rawSnippet),
    isRead: r.isRead,
    isStarred: r.isStarred,
    publishedAt: r.publishedAt,
  }));
}

export interface FeedHit {
  feedId: string;
  title: string | null;
  iconUrl: string | null;
  unreadCount: number;
}

export async function searchFeedsByName(userId: string, q: string, limit = 5): Promise<FeedHit[]> {
  const like = "%" + q + "%";
  return db
    .select({
      feedId: feeds.id,
      title: sql<string | null>`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      iconUrl: feeds.iconUrl,
      unreadCount: sql<number>`(
        select count(*)::int from ${articles} a
        left join ${userArticles} ua
          on ua.article_id = a.id and ua.user_id = ${userId}
        where a.feed_id = ${feeds.id}
          and (ua.is_read is null or ua.is_read = false)
          and ua.is_hidden is not true
      )`,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(subscriptions.feedId, feeds.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        sql`feedwise_search_query(${q}) is not null`,
        or(
          ilike(feeds.title, like),
          ilike(subscriptions.customTitle, like),
          ilike(feeds.description, like),
        ),
      ),
    )
    .orderBy(
      sql`(case when coalesce(${subscriptions.customTitle}, ${feeds.title}) ILIKE ${q + "%"} then 0 else 1 end), coalesce(${subscriptions.customTitle}, ${feeds.title})`,
    )
    .limit(Math.min(limit, 20));
}

export interface TagHit {
  id: string;
  name: string;
  color: string | null;
  articleCount: number;
}

export async function searchTagsByName(userId: string, q: string, limit = 5): Promise<TagHit[]> {
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
    .where(
      and(
        eq(tags.userId, userId),
        sql`feedwise_search_query(${q}) is not null`,
        ilike(tags.name, "%" + q + "%"),
      ),
    )
    .orderBy(tags.name)
    .limit(Math.min(limit, 20));
}
