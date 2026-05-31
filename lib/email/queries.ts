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
import { encryptSecret, decryptIfEncrypted } from "@/lib/crypto/secrets";

function encryptIfPresent(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (value === "") return null;
  return encryptSecret(value);
}

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
  autoSaveOnClick?: boolean;
  markReadOnClick?: boolean;
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
    smtpPass: decryptIfEncrypted(sub.smtpPass),
    smtpFrom: sub.smtpFrom,
    emailProvider: sub.emailProvider,
    emailApiKey: decryptIfEncrypted(sub.emailApiKey),
    autoSaveOnClick: sub.autoSaveOnClick ?? false,
    markReadOnClick: sub.markReadOnClick ?? true,
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
        smtpPass: encryptIfPresent(settings.smtpPass) ?? null,
        smtpFrom: settings.smtpFrom,
        emailProvider: settings.emailProvider,
        emailApiKey: encryptIfPresent(settings.emailApiKey) ?? null,
        autoSaveOnClick: settings.autoSaveOnClick ?? false,
        markReadOnClick: settings.markReadOnClick ?? true,
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
      smtpPass: settings.smtpPass !== undefined ? encryptIfPresent(settings.smtpPass) ?? null : existing.smtpPass,
      smtpFrom: settings.smtpFrom !== undefined ? settings.smtpFrom : existing.smtpFrom,
      emailProvider: settings.emailProvider !== undefined ? settings.emailProvider : existing.emailProvider,
      emailApiKey: settings.emailApiKey !== undefined ? encryptIfPresent(settings.emailApiKey) ?? null : existing.emailApiKey,
      autoSaveOnClick: settings.autoSaveOnClick ?? existing.autoSaveOnClick,
      markReadOnClick: settings.markReadOnClick ?? existing.markReadOnClick,
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

  const matched = !hasSelectedFeeds && !hasSelectedTags
    ? rows
    : rows.filter((row) => {
        const feedMatch = hasSelectedFeeds && settings.selectedFeeds.includes(row.feedId as string);
        const tagMatch = hasSelectedTags && taggedArticleIds.has(row.id);
        if (hasSelectedFeeds && hasSelectedTags) return feedMatch || tagMatch;
        if (hasSelectedFeeds) return feedMatch;
        if (hasSelectedTags) return tagMatch;
        return false;
      });

  // Batch-fetch tags for the in-window articles so the digest can group by tag
  // without an N+1 lookup downstream.
  const articleIds = matched.map((r) => r.id);
  const tagRows = articleIds.length === 0
    ? []
    : await db
        .select({
          articleId: articleTags.articleId,
          tagId: tags.id,
          tagName: tags.name,
        })
        .from(articleTags)
        .innerJoin(tags, eq(articleTags.tagId, tags.id))
        .where(
          and(
            inArray(articleTags.articleId, articleIds),
            eq(tags.userId, userId)
          )
        );

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

export async function getUsersWithAutoTagEnabled(): Promise<string[]> {
  const rows = await db
    .select({ userId: emailSubscriptions.userId })
    .from(emailSubscriptions)
    .where(
      and(
        eq(emailSubscriptions.autoTag, true),
        eq(emailSubscriptions.llmEnabled, true)
      )
    );
  return rows.map((r) => r.userId);
}

export async function getUsersWithAutoSummarizeEnabled(): Promise<string[]> {
  const rows = await db
    .select({ userId: emailSubscriptions.userId })
    .from(emailSubscriptions)
    .where(
      and(
        eq(emailSubscriptions.autoSummarize, true),
        eq(emailSubscriptions.llmEnabled, true)
      )
    );
  return rows.map((r) => r.userId);
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

export async function getAllActiveSubscriptions() {
  const rows = await db
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
      autoSaveOnClick: emailSubscriptions.autoSaveOnClick,
      markReadOnClick: emailSubscriptions.markReadOnClick,
    })
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.enabled, true));
  return rows.map((r) => ({ ...r, smtpPass: decryptIfEncrypted(r.smtpPass) }));
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
    pass: decryptIfEncrypted(sub.smtpPass) ?? "",
    from: sub.smtpFrom || "Feedwise <noreply@feedwise.app>",
  };
}

export type LlmFormat = "openai" | "anthropic";

export interface LlmConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  format: LlmFormat;
  autoSummarize: boolean;
  autoTag: boolean;
}

export async function getUserLlmConfig(userId: string): Promise<LlmConfig | null> {
  const sub = await getUserSubscription(userId);
  if (!sub || !sub.llmEnabled || !sub.llmBaseUrl || !sub.llmApiKey || !sub.llmModel) {
    return null;
  }
  let apiKey = "";
  try {
    apiKey = decryptIfEncrypted(sub.llmApiKey) ?? "";
  } catch {
    // Decryption failed (key rotated or corrupted) — surface as no config
    return null;
  }
  return {
    enabled: true,
    baseUrl: sub.llmBaseUrl,
    apiKey,
    model: sub.llmModel,
    format: (sub.llmFormat as LlmFormat) ?? "openai",
    autoSummarize: sub.autoSummarize ?? true,
    autoTag: sub.autoTag ?? false,
  };
}

export interface LlmConfigInput {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  format?: LlmFormat;
  autoSummarize?: boolean;
  autoTag?: boolean;
}

export async function updateUserLlmConfig(userId: string, input: LlmConfigInput): Promise<void> {
  const existing = await getUserSubscription(userId);
  const apiKeyToStore =
    input.apiKey === undefined
      ? existing?.llmApiKey ?? null
      : input.apiKey === ""
        ? null
        : encryptSecret(input.apiKey);

  if (!existing) {
    await db.insert(emailSubscriptions).values({
      userId,
      enabled: false,
      llmEnabled: input.enabled,
      llmBaseUrl: input.baseUrl || null,
      llmApiKey: apiKeyToStore,
      llmModel: input.model || null,
      llmFormat: input.format ?? "openai",
      ...(input.autoSummarize !== undefined ? { autoSummarize: input.autoSummarize } : {}),
      ...(input.autoTag !== undefined ? { autoTag: input.autoTag } : {}),
    });
    return;
  }
  await db
    .update(emailSubscriptions)
    .set({
      llmEnabled: input.enabled,
      llmBaseUrl: input.baseUrl || null,
      llmApiKey: apiKeyToStore,
      llmModel: input.model || null,
      llmFormat: input.format ?? existing.llmFormat ?? "openai",
      ...(input.autoSummarize !== undefined ? { autoSummarize: input.autoSummarize } : {}),
      ...(input.autoTag !== undefined ? { autoTag: input.autoTag } : {}),
      updatedAt: new Date(),
    })
    .where(eq(emailSubscriptions.id, existing.id));
}
