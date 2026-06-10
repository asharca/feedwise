import { eq, and, gt, lte, sql, not, inArray, exists } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  emailSentArticles,
  emailSubscriptionTags,
  emailSubscriptionFeeds,
  articles,
  feeds,
  subscriptions,
  articleTags,
  tags,
} from "@/lib/db/schema";
import type { EmailArticle } from "./sender";
import { getSubscriptionSettings } from "./subscription-settings";

export async function getArticlesForEmail(
  userId: string,
  fromDate?: Date,
  toDate?: Date,
): Promise<EmailArticle[]> {
  const settings = await getSubscriptionSettings(userId);
  if (!settings) return [];

  const upperBound = toDate ?? new Date();

  // Use createdAt (when added to DB) so RSS articles with old publishedAt dates are
  // correctly bucketed by when they actually appeared, not their original pub date.
  const dateCondition = fromDate
    ? and(gt(articles.createdAt, fromDate), lte(articles.createdAt, upperBound))
    : lte(articles.createdAt, upperBound);

  const query = db
    .select({
      id: articles.id,
      title: articles.title,
      url: articles.url,
      summary: articles.summary,
      aiSummary: articles.aiSummary,
      importance: articles.importance,
      feedTitle: feeds.title,
      feedId: feeds.id,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .where(
      and(
        dateCondition,
        not(
          exists(
            db
              .select({ one: sql`1` })
              .from(emailSentArticles)
              .where(
                and(
                  eq(emailSentArticles.userId, userId),
                  eq(emailSentArticles.articleId, articles.id),
                ),
              ),
          ),
        ),
      ),
    );

  const rows = await query;

  // Pre-fetch tagged article IDs if tags are selected
  let taggedArticleIds = new Set<string>();
  if (settings.selectedTags.length > 0) {
    const articleIdsWithTags = await db
      .select({ articleId: articleTags.articleId })
      .from(articleTags)
      .where(inArray(articleTags.tagId, settings.selectedTags));
    taggedArticleIds = new Set(articleIdsWithTags.map((r) => r.articleId));
  }

  const hasSelectedFeeds = settings.selectedFeeds.length > 0;
  const hasSelectedTags = settings.selectedTags.length > 0;

  const matched =
    !hasSelectedFeeds && !hasSelectedTags
      ? rows
      : rows.filter((row) => {
          const feedMatch =
            hasSelectedFeeds && settings.selectedFeeds.includes(row.feedId as string);
          const tagMatch = hasSelectedTags && taggedArticleIds.has(row.id);
          if (hasSelectedFeeds && hasSelectedTags) return feedMatch || tagMatch;
          if (hasSelectedFeeds) return feedMatch;
          if (hasSelectedTags) return tagMatch;
          return false;
        });

  // Batch-fetch tags for the in-window articles so the digest can group by tag
  // without an N+1 lookup downstream.
  const articleIds = matched.map((r) => r.id);
  const tagRows =
    articleIds.length === 0
      ? []
      : await db
          .select({
            articleId: articleTags.articleId,
            tagId: tags.id,
            tagName: tags.name,
          })
          .from(articleTags)
          .innerJoin(tags, eq(articleTags.tagId, tags.id))
          .where(and(inArray(articleTags.articleId, articleIds), eq(tags.userId, userId)));

  const tagsByArticle = new Map<string, Array<{ id: string; name: string }>>();
  for (const t of tagRows) {
    if (!tagsByArticle.has(t.articleId)) tagsByArticle.set(t.articleId, []);
    tagsByArticle.get(t.articleId)!.push({ id: t.tagId, name: t.tagName });
  }

  return matched.map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled",
    url: row.url ?? "",
    summary: row.summary,
    aiSummary: row.aiSummary,
    importance: row.importance,
    feedTitle: row.feedTitle,
    feedId: row.feedId,
    publishedAt: row.publishedAt,
    tags: tagsByArticle.get(row.id) ?? [],
  }));
}

export async function markArticlesAsSent(userId: string, articleIds: string[]) {
  if (articleIds.length === 0) return;
  await db
    .insert(emailSentArticles)
    .values(
      articleIds.map((articleId) => ({
        userId,
        articleId,
        sentAt: new Date(),
      })),
    )
    .onConflictDoNothing();
}
