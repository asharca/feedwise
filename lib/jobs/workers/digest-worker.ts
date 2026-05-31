import { CronExpressionParser } from "cron-parser";
import type { CronDate } from "cron-parser";
import {
  getAllActiveSubscriptions,
  getUserEmail,
  getArticlesForEmail,
  markArticlesAsSent,
  logDigestSend,
  updateNextScheduledAt,
  getLastDigestSentDate,
} from "@/lib/email/queries";
import { sendDailyDigest } from "@/lib/email/sender";
import { dedupeByCanonicalUrl, dedupeByTitleSimilarity } from "@/lib/digest/dedupe";
import { buildTagBasedDigest } from "@/lib/digest/organize-by-tag";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import { buildEmailLinkFn } from "@/lib/email/click-link";
import type { DigestArticle, OrganizedDigest } from "@/lib/digest/types";

const DEFAULT_CRON = "0 8 * * *"; // Daily at 8:00 AM

/**
 * Process daily digests using cron expressions with article-level tracking.
 *
 * Key improvements:
 * 1. Cron-based scheduling instead of fixed sendTime
 * 2. Article-level deduplication via emailSentArticles table
 * 3. Proper catch-up: sends missed digest windows without corrupting state
 * 4. Date-bounded article queries (no future articles in catch-up)
 * 5. Per-digest logging for history and retry safety
 */
export async function processDailyDigests() {
  const subscriptions = await getAllActiveSubscriptions();
  const now = new Date();

  for (const sub of subscriptions) {
    try {
      const cronExpr = sub.cronExpression || cronFromLegacySettings(sub.frequency, sub.sendTime);
      const lastSent = await getLastDigestSentDate(sub.userId);

      // Compute all trigger dates between last successful send and now
      const missedDates = getMissedCronTriggers(cronExpr, lastSent, now);

      if (missedDates.length === 0) {
        continue;
      }

      console.log(
        `[digest] User ${sub.userId}: ${missedDates.length} missed trigger(s) for cron "${cronExpr}"`
      );

      // Send a digest for each missed trigger date, passing the previous
      // trigger as the lower bound so no articles fall between windows.
      for (let i = 0; i < missedDates.length; i++) {
        const triggerDate = missedDates[i];
        const fromDate = i === 0 ? lastSent : missedDates[i - 1];
        await sendDigestForDate(sub, triggerDate, fromDate);
      }

      // Update nextScheduledAt to the upcoming trigger
      const nextTrigger = getNextCronTrigger(cronExpr, now);
      if (nextTrigger) {
        await updateNextScheduledAt(sub.userId, nextTrigger);
      }
    } catch (err) {
      console.error(`[digest] Failed for user ${sub.userId}:`, err);
      // Continue with next subscription
    }
  }
}

/**
 * Build the digest from articles whose per-article enrichment (tag + AI
 * summary) has already happened in the background. Dedupes by URL/title,
 * groups by primary tag, no synchronous LLM call.
 *
 * Articles without an ai_summary still appear (they just render the RSS
 * summary as a fallback in the template). Articles without tags fall into
 * an "Uncategorized" group.
 *
 * `userId` is kept in the signature for callers that still pass it; the
 * function no longer needs it because no per-user LLM call is made here.
 */
export async function assembleDigestForSubscription(
  _userId: string,
  articles: DigestArticle[]
): Promise<{ digest: OrganizedDigest; allArticleIds: string[] }> {
  const allArticleIds = articles.map((a) => a.id);

  const dedupedByUrl = dedupeByCanonicalUrl(articles);
  const deduped = dedupeByTitleSimilarity(dedupedByUrl, 0.85);
  // dedupe returns DedupedArticle[]; we just want the primaries for grouping.
  const primaries = deduped.map((d) => d.primary);

  const digest = buildTagBasedDigest(primaries);
  return { digest, allArticleIds };
}

async function sendDigestForDate(
  subscription: Awaited<ReturnType<typeof getAllActiveSubscriptions>>[0],
  triggerDate: Date,
  fromDate: Date | null
) {
  const email = await getUserEmail(subscription.userId);
  if (!email) {
    console.log(`[digest] No email for user ${subscription.userId}`);
    return;
  }

  const articles = await getArticlesForEmail(
    subscription.userId,
    fromDate ?? undefined,
    triggerDate
  );

  const { digest, allArticleIds } = await assembleDigestForSubscription(
    subscription.userId,
    articles
  );

  const smtpConfig =
    subscription.smtpHost && subscription.smtpUser && subscription.smtpPass
      ? {
          host: subscription.smtpHost,
          port: subscription.smtpPort || 587,
          user: subscription.smtpUser,
          pass: subscription.smtpPass,
          from: subscription.smtpFrom || "Feedwise <noreply@feedwise.app>",
        }
      : null;

  const dateStr = triggerDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const subject =
    articles.length === 0
      ? `Feedwise Digest - ${dateStr} - No new articles`
      : `Feedwise Digest - ${dateStr} - ${articles.length} article${articles.length === 1 ? "" : "s"}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl) {
    console.warn(
      "[digest] NEXT_PUBLIC_APP_URL is not set — email links will skip /api/r so clicks won't mark articles read/starred."
    );
  }
  const buildLink = buildEmailLinkFn(subscription.userId, appUrl, {
    markReadOnClick: subscription.markReadOnClick,
    autoSaveOnClick: subscription.autoSaveOnClick,
  });

  const html =
    digest.mode === "clustered"
      ? await renderDigestHtml(digest, buildLink)
      : await renderFallbackHtml(digest, buildLink);

  try {
    await sendDailyDigestWithRetry({ to: email, subject, html, smtpConfig });
    await markArticlesAsSent(subscription.userId, allArticleIds);
    await logDigestSend(subscription.userId, articles.length, "success");
    console.log(
      `[digest] Sent digest to ${email} (${articles.length} articles, mode=${digest.mode}) for ${triggerDate.toDateString()}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logDigestSend(subscription.userId, articles.length, "failed", message);
    console.error(`[digest] Failed to send to ${email}:`, message);
    throw err;
  }
}

const SEND_RETRY_ATTEMPTS = 3;
const SEND_RETRY_BASE_MS = 5_000;

async function sendDailyDigestWithRetry(
  params: Parameters<typeof sendDailyDigest>[0]
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= SEND_RETRY_ATTEMPTS; attempt++) {
    try {
      await sendDailyDigest(params);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt === SEND_RETRY_ATTEMPTS) break;
      const delay = SEND_RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[digest] Send attempt ${attempt} failed, retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

/**
 * Convert legacy frequency + sendTime into a cron expression.
 */
function cronFromLegacySettings(
  frequency: "daily" | "weekly" | null,
  sendTime: string | null
): string {
  const time = sendTime || "08:00";
  const [hour, minute] = time.split(":").map(Number);
  const m = String(minute).padStart(2, "0");
  const h = String(hour).padStart(2, "0");

  if (frequency === "weekly") {
    // Default to Monday for weekly if no cron set
    return `${m} ${h} * * 1`;
  }
  return `${m} ${h} * * *`;
}

/**
 * Get all cron trigger dates between (lastSent, upToDate].
 * If lastSent is null, returns only triggers within the last 24h to avoid spam on first enable.
 */
function getMissedCronTriggers(
  cronExpr: string,
  lastSent: Date | null,
  upToDate: Date
): Date[] {
  try {
    const startDate = lastSent || new Date(upToDate.getTime() - 24 * 60 * 60 * 1000);
    const expr = CronExpressionParser.parse(cronExpr, {
      currentDate: startDate,
    });

    const triggers: Date[] = [];

    for (const cronDate of expr) {
      const d = cronDate.toDate();
      if (d.getTime() > upToDate.getTime()) break;
      // Skip the exact startDate if it matches (we want triggers AFTER lastSent)
      if (lastSent && d.getTime() <= lastSent.getTime()) continue;
      triggers.push(d);
      // Safety limit
      if (triggers.length >= 365) break;
    }

    return triggers;
  } catch {
    console.error(`[digest] Invalid cron expression: ${cronExpr}`);
    return [];
  }
}

/**
 * Get the next upcoming cron trigger strictly after the given date.
 */
function getNextCronTrigger(cronExpr: string, after: Date): Date | null {
  try {
    const expr = CronExpressionParser.parse(cronExpr, {
      currentDate: after,
    });
    const next = expr.next().toDate();
    // If next is exactly `after`, get the one after that
    if (next.getTime() === after.getTime()) {
      return expr.next().toDate();
    }
    return next;
  } catch {
    return null;
  }
}
