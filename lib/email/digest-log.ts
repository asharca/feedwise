import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  emailSentArticles,
  emailDigestLogs,
  emailDigestLogArticles,
  articles,
  feeds,
  articleTags,
  tags,
} from "@/lib/db/schema";
import type { EmailArticle } from "./sender";

export async function logDigestSend(
  userId: string,
  articleCount: number,
  status: "success" | "failed",
  errorMessage?: string,
): Promise<string> {
  return logDigestSendWithArticles(userId, [], articleCount, status, errorMessage);
}

export async function getLastDigestSentDate(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ sentAt: emailDigestLogs.sentAt })
    .from(emailDigestLogs)
    .where(and(eq(emailDigestLogs.userId, userId), eq(emailDigestLogs.status, "success")))
    .orderBy(sql`${emailDigestLogs.sentAt} desc`)
    .limit(1);
  return row?.sentAt ?? null;
}

export async function getDigestHistory(userId: string, limit: number = 30) {
  return db
    .select({
      id: emailDigestLogs.id,
      sentAt: emailDigestLogs.sentAt,
      articleCount: emailDigestLogs.articleCount,
      status: emailDigestLogs.status,
      errorMessage: emailDigestLogs.errorMessage,
    })
    .from(emailDigestLogs)
    .where(eq(emailDigestLogs.userId, userId))
    .orderBy(sql`${emailDigestLogs.sentAt} desc`)
    .limit(limit);
}

export async function getDigestLogById(logId: string, userId: string) {
  const [row] = await db
    .select({
      id: emailDigestLogs.id,
      sentAt: emailDigestLogs.sentAt,
      articleCount: emailDigestLogs.articleCount,
      status: emailDigestLogs.status,
      errorMessage: emailDigestLogs.errorMessage,
    })
    .from(emailDigestLogs)
    .where(and(eq(emailDigestLogs.id, logId), eq(emailDigestLogs.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function logDigestSendWithArticles(
  userId: string,
  articleIds: string[],
  articleCount: number,
  status: "success" | "failed",
  errorMessage?: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [log] = await tx
      .insert(emailDigestLogs)
      .values({
        userId,
        articleCount,
        status,
        errorMessage: errorMessage ?? null,
        sentAt: new Date(),
      })
      .returning({ id: emailDigestLogs.id });

    if (articleIds.length > 0) {
      await tx
        .insert(emailDigestLogArticles)
        .values(
          articleIds.map((articleId) => ({
            logId: log.id,
            articleId,
          })),
        )
        .onConflictDoNothing();
    }

    return log.id;
  });
}

/**
 * Atomically record a successful digest send: mark articles as sent, write
 * the digest log, and link articles to the log — all in one transaction so a
 * crash can't leave articles marked sent without a corresponding log.
 *
 * Note: the SMTP send itself cannot be in the transaction. If the process
 * dies between send-success and this commit, the next tick re-sends that
 * window — we accept rare duplicate emails over silently lost articles.
 */
export async function recordDigestSent(
  userId: string,
  articleIds: string[],
  articleCount: number,
): Promise<string> {
  return db.transaction(async (tx) => {
    if (articleIds.length > 0) {
      await tx
        .insert(emailSentArticles)
        .values(articleIds.map((articleId) => ({ userId, articleId, sentAt: new Date() })))
        .onConflictDoNothing();
    }
    const [log] = await tx
      .insert(emailDigestLogs)
      .values({ userId, articleCount, status: "success", errorMessage: null, sentAt: new Date() })
      .returning({ id: emailDigestLogs.id });
    if (articleIds.length > 0) {
      await tx
        .insert(emailDigestLogArticles)
        .values(articleIds.map((articleId) => ({ logId: log.id, articleId })))
        .onConflictDoNothing();
    }
    return log.id;
  });
}

export async function getArticlesForLog(logId: string, userId: string): Promise<EmailArticle[]> {
  // Defensive ownership check: the join returns no rows if the log is owned
  // by a different user, even if the caller passes a guessed logId.
  const rows = await db
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
    .from(emailDigestLogArticles)
    .innerJoin(articles, eq(emailDigestLogArticles.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      emailDigestLogs,
      and(eq(emailDigestLogs.id, emailDigestLogArticles.logId), eq(emailDigestLogs.userId, userId)),
    )
    .where(eq(emailDigestLogArticles.logId, logId));

  if (rows.length === 0) return [];

  const articleIds = rows.map((r) => r.id);
  const tagRows = await db
    .select({
      articleId: articleTags.articleId,
      tagId: tags.id,
      tagName: tags.name,
    })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(inArray(articleTags.articleId, articleIds));

  const tagsByArticle = new Map<string, { id: string; name: string }[]>();
  for (const tr of tagRows) {
    const list = tagsByArticle.get(tr.articleId) ?? [];
    list.push({ id: tr.tagId, name: tr.tagName });
    tagsByArticle.set(tr.articleId, list);
  }

  return rows.map((row) => ({
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
