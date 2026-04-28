import { eq, and, gt, lte, sql, not, inArray, exists } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  emailSubscriptions,
  emailSubscriptionTags,
  emailSubscriptionFeeds,
  emailSentArticles,
  emailDigestLogs,
  users,
  articles,
  feeds,
  subscriptions,
  tags,
  articleTags,
} from "@/lib/db/schema";
import type { EmailArticle } from "./sender";

export interface SubscriptionSettings {
  enabled: boolean;
  sendTime: string;
  frequency: "daily" | "weekly";
  cronExpression: string | null;
  selectedTags: string[];
  selectedFeeds: string[];
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
  emailProvider?: string | null;
  emailApiKey?: string | null;
}

export interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export async function getUserSubscription(userId: string) {
  const [sub] = await db
    .select()
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.userId, userId));
  return sub ?? null;
}

export async function getSubscriptionSettings(userId: string): Promise<SubscriptionSettings | null> {
  const sub = await getUserSubscription(userId);
  if (!sub) return null;

  const tagRows = await db
    .select({ tagId: emailSubscriptionTags.tagId })
    .from(emailSubscriptionTags)
    .where(eq(emailSubscriptionTags.subscriptionId, sub.id));

  const feedRows = await db
    .select({ feedId: emailSubscriptionFeeds.feedId })
    .from(emailSubscriptionFeeds)
    .where(eq(emailSubscriptionFeeds.subscriptionId, sub.id));

  return {
    enabled: sub.enabled,
    sendTime: sub.sendTime ?? "08:00",
    frequency: sub.frequency ?? "daily",
    cronExpression: sub.cronExpression ?? null,
    selectedTags: tagRows.map((r) => r.tagId),
    selectedFeeds: feedRows.map((r) => r.feedId),
    smtpHost: sub.smtpHost,
    smtpPort: sub.smtpPort,
    smtpUser: sub.smtpUser,
    smtpPass: sub.smtpPass,
    smtpFrom: sub.smtpFrom,
    emailProvider: sub.emailProvider,
    emailApiKey: sub.emailApiKey,
  };
}

export async function updateSubscriptionSettings(
  userId: string,
  settings: Partial<SubscriptionSettings>
): Promise<SubscriptionSettings> {
  const existing = await getUserSubscription(userId);

  if (!existing) {
    const [created] = await db
      .insert(emailSubscriptions)
      .values({
        userId,
        enabled: settings.enabled ?? false,
        sendTime: settings.sendTime ?? "08:00",
        frequency: settings.frequency ?? "daily",
        cronExpression: settings.cronExpression ?? null,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort ?? 587,
        smtpUser: settings.smtpUser,
        smtpPass: settings.smtpPass,
        smtpFrom: settings.smtpFrom,
        emailProvider: settings.emailProvider,
        emailApiKey: settings.emailApiKey,
      })
      .returning();
    await syncSubscriptionEntities(created.id, settings);
    return await getSubscriptionSettings(userId) as SubscriptionSettings;
  }

  await db
    .update(emailSubscriptions)
    .set({
      enabled: settings.enabled ?? existing.enabled,
      sendTime: settings.sendTime ?? existing.sendTime,
      frequency: settings.frequency ?? existing.frequency,
      cronExpression: settings.cronExpression !== undefined ? settings.cronExpression : existing.cronExpression,
      smtpHost: settings.smtpHost !== undefined ? settings.smtpHost : existing.smtpHost,
      smtpPort: settings.smtpPort !== undefined ? settings.smtpPort : existing.smtpPort,
      smtpUser: settings.smtpUser !== undefined ? settings.smtpUser : existing.smtpUser,
      smtpPass: settings.smtpPass !== undefined ? settings.smtpPass : existing.smtpPass,
      smtpFrom: settings.smtpFrom !== undefined ? settings.smtpFrom : existing.smtpFrom,
      emailProvider: settings.emailProvider !== undefined ? settings.emailProvider : existing.emailProvider,
      emailApiKey: settings.emailApiKey !== undefined ? settings.emailApiKey : existing.emailApiKey,
      updatedAt: new Date(),
    })
    .where(eq(emailSubscriptions.id, existing.id));

  await syncSubscriptionEntities(existing.id, settings);
  return await getSubscriptionSettings(userId) as SubscriptionSettings;
}

export async function updateNextScheduledAt(userId: string, nextAt: Date) {
  await db
    .update(emailSubscriptions)
    .set({ nextScheduledAt: nextAt, updatedAt: new Date() })
    .where(eq(emailSubscriptions.userId, userId));
}

async function syncSubscriptionEntities(subscriptionId: string, settings: Partial<SubscriptionSettings>) {
  if (settings.selectedTags !== undefined) {
    await db.delete(emailSubscriptionTags).where(eq(emailSubscriptionTags.subscriptionId, subscriptionId));
    if (settings.selectedTags.length > 0) {
      await db.insert(emailSubscriptionTags).values(
        settings.selectedTags.map((tagId) => ({
          subscriptionId,
          tagId,
        }))
      );
    }
  }

  if (settings.selectedFeeds !== undefined) {
    await db.delete(emailSubscriptionFeeds).where(eq(emailSubscriptionFeeds.subscriptionId, subscriptionId));
    if (settings.selectedFeeds.length > 0) {
      const validFeeds = await db
        .select({ id: feeds.id })
        .from(feeds)
        .where(sql`${feeds.id} in ${settings.selectedFeeds}`);
      const validFeedIds = new Set(validFeeds.map(f => f.id));
      const filteredFeedIds = settings.selectedFeeds.filter(id => validFeedIds.has(id));

      if (filteredFeedIds.length > 0) {
        await db.insert(emailSubscriptionFeeds).values(
          filteredFeedIds.map((feedId) => ({
            subscriptionId,
            feedId,
          }))
        );
      }
    }
  }
}

export async function getArticlesForEmail(
  userId: string,
  fromDate?: Date,
  toDate?: Date
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
      feedTitle: feeds.title,
      feedId: feeds.id,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId))
    )
    .where(
      and(
        dateCondition,
        not(exists(
          db.select({ one: sql`1` })
            .from(emailSentArticles)
            .where(
              and(
                eq(emailSentArticles.userId, userId),
                eq(emailSentArticles.articleId, articles.id)
              )
            )
        ))
      )
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

  // Nothing selected = include all
  if (!hasSelectedFeeds && !hasSelectedTags) {
    return rows.map((row) => ({
      id: row.id,
      title: row.title ?? "Untitled",
      url: row.url ?? "",
      summary: row.summary,
      feedTitle: row.feedTitle,
      publishedAt: row.publishedAt,
    }));
  }

  const filtered = rows.filter((row) => {
    const feedMatch = hasSelectedFeeds && settings.selectedFeeds.includes(row.feedId as string);
    const tagMatch = hasSelectedTags && taggedArticleIds.has(row.id);

    // If both feeds and tags are selected, match either (OR)
    if (hasSelectedFeeds && hasSelectedTags) return feedMatch || tagMatch;
    if (hasSelectedFeeds) return feedMatch;
    if (hasSelectedTags) return tagMatch;
    return false;
  });

  return filtered.map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled",
    url: row.url ?? "",
    summary: row.summary,
    feedTitle: row.feedTitle,
    publishedAt: row.publishedAt,
  }));
}

export async function markArticlesAsSent(userId: string, articleIds: string[]) {
  if (articleIds.length === 0) return;
  await db.insert(emailSentArticles).values(
    articleIds.map((articleId) => ({
      userId,
      articleId,
      sentAt: new Date(),
    }))
  ).onConflictDoNothing();
}

export async function logDigestSend(
  userId: string,
  articleCount: number,
  status: "success" | "failed",
  errorMessage?: string
) {
  await db.insert(emailDigestLogs).values({
    userId,
    articleCount,
    status,
    errorMessage: errorMessage ?? null,
    sentAt: new Date(),
  });
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

export async function getAllActiveSubscriptions() {
  return db
    .select({
      id: emailSubscriptions.id,
      userId: emailSubscriptions.userId,
      sendTime: emailSubscriptions.sendTime,
      frequency: emailSubscriptions.frequency,
      cronExpression: emailSubscriptions.cronExpression,
      nextScheduledAt: emailSubscriptions.nextScheduledAt,
      lastSentAt: emailSubscriptions.lastSentAt,
      smtpHost: emailSubscriptions.smtpHost,
      smtpPort: emailSubscriptions.smtpPort,
      smtpUser: emailSubscriptions.smtpUser,
      smtpPass: emailSubscriptions.smtpPass,
      smtpFrom: emailSubscriptions.smtpFrom,
    })
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.enabled, true));
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return user?.email ?? null;
}

export async function markDigestSent(userId: string) {
  await db
    .update(emailSubscriptions)
    .set({ lastSentAt: new Date() })
    .where(eq(emailSubscriptions.userId, userId));
}

export async function getUserSMTPConfig(userId: string): Promise<SMTPConfig | null> {
  const sub = await getUserSubscription(userId);
  if (!sub?.smtpHost || !sub?.smtpUser || !sub?.smtpPass) return null;

  return {
    host: sub.smtpHost,
    port: sub.smtpPort || 587,
    user: sub.smtpUser,
    pass: sub.smtpPass,
    from: sub.smtpFrom || "Feedwise <noreply@feedwise.app>",
  };
}
