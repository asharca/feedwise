import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, subscriptions, feeds, userArticles } from "@/lib/db/schema";
import { getSubscribedArticle } from "@/lib/db/queries/feeds";

export async function relatedArticles(userId: string, articleId: string) {
  const source = await getSubscribedArticle(userId, articleId);
  if (!source) return null;
  if (source.simhash === null) return [];
  const distance = sql<number>`bit_count((${articles.simhash} # ${source.simhash.toString()}::bigint)::bit(64))`;
  const sortAt = source.sortAt.toISOString();
  return db
    .select({
      id: articles.id,
      title: articles.title,
      url: articles.url,
      feedId: feeds.id,
      feedTitle: feeds.title,
      feedIconUrl: feeds.iconUrl,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
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
        ne(articles.feedId, source.feedId),
        sql`${userArticles.isHidden} is not true`,
        sql`${articles.sortAt} between ${sortAt}::timestamp - interval '3 days' and ${sortAt}::timestamp + interval '3 days'`,
        sql`${distance} <= 3`,
      ),
    )
    .orderBy(distance, desc(articles.sortAt), desc(articles.id))
    .limit(10);
}
