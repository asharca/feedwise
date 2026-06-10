import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  emailSubscriptions,
  emailSubscriptionTags,
  emailSubscriptionFeeds,
  users,
  feeds,
} from "@/lib/db/schema";
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

export async function getSubscriptionSettings(
  userId: string,
): Promise<SubscriptionSettings | null> {
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
  settings: Partial<SubscriptionSettings>,
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
    return (await getSubscriptionSettings(userId)) as SubscriptionSettings;
  }

  await db
    .update(emailSubscriptions)
    .set({
      enabled: settings.enabled ?? existing.enabled,
      sendTime: settings.sendTime ?? existing.sendTime,
      frequency: settings.frequency ?? existing.frequency,
      cronExpression:
        settings.cronExpression !== undefined ? settings.cronExpression : existing.cronExpression,
      smtpHost: settings.smtpHost !== undefined ? settings.smtpHost : existing.smtpHost,
      smtpPort: settings.smtpPort !== undefined ? settings.smtpPort : existing.smtpPort,
      smtpUser: settings.smtpUser !== undefined ? settings.smtpUser : existing.smtpUser,
      smtpPass:
        settings.smtpPass !== undefined
          ? (encryptIfPresent(settings.smtpPass) ?? null)
          : existing.smtpPass,
      smtpFrom: settings.smtpFrom !== undefined ? settings.smtpFrom : existing.smtpFrom,
      emailProvider:
        settings.emailProvider !== undefined ? settings.emailProvider : existing.emailProvider,
      emailApiKey:
        settings.emailApiKey !== undefined
          ? (encryptIfPresent(settings.emailApiKey) ?? null)
          : existing.emailApiKey,
      autoSaveOnClick: settings.autoSaveOnClick ?? existing.autoSaveOnClick,
      markReadOnClick: settings.markReadOnClick ?? existing.markReadOnClick,
      updatedAt: new Date(),
    })
    .where(eq(emailSubscriptions.id, existing.id));

  await syncSubscriptionEntities(existing.id, settings);
  return (await getSubscriptionSettings(userId)) as SubscriptionSettings;
}

export async function updateNextScheduledAt(userId: string, nextAt: Date) {
  await db
    .update(emailSubscriptions)
    .set({ nextScheduledAt: nextAt, updatedAt: new Date() })
    .where(eq(emailSubscriptions.userId, userId));
}

async function syncSubscriptionEntities(
  subscriptionId: string,
  settings: Partial<SubscriptionSettings>,
) {
  if (settings.selectedTags !== undefined) {
    await db
      .delete(emailSubscriptionTags)
      .where(eq(emailSubscriptionTags.subscriptionId, subscriptionId));
    if (settings.selectedTags.length > 0) {
      await db.insert(emailSubscriptionTags).values(
        settings.selectedTags.map((tagId) => ({
          subscriptionId,
          tagId,
        })),
      );
    }
  }

  if (settings.selectedFeeds !== undefined) {
    await db
      .delete(emailSubscriptionFeeds)
      .where(eq(emailSubscriptionFeeds.subscriptionId, subscriptionId));
    if (settings.selectedFeeds.length > 0) {
      const validFeeds = await db
        .select({ id: feeds.id })
        .from(feeds)
        .where(sql`${feeds.id} in ${settings.selectedFeeds}`);
      const validFeedIds = new Set(validFeeds.map((f) => f.id));
      const filteredFeedIds = settings.selectedFeeds.filter((id) => validFeedIds.has(id));

      if (filteredFeedIds.length > 0) {
        await db.insert(emailSubscriptionFeeds).values(
          filteredFeedIds.map((feedId) => ({
            subscriptionId,
            feedId,
          })),
        );
      }
    }
  }
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
