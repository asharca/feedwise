import { getAllActiveSubscriptions, getUserEmail, getArticlesForEmail, markDigestSent, getUserSMTPConfig } from "@/lib/email/queries";
import { sendDailyDigest } from "@/lib/email/sender";

/**
 * Process daily digests with catch-up mechanism to prevent missed emails.
 * 
 * Key improvements:
 * 1. Catch-up: If a day was missed, send the digest for that day
 * 2. Time window: Allow sending within a window around sendTime (not just exact minute)
 * 3. Retry logic: Failed sends will be retried on next run
 */
export async function processDailyDigests() {
  const subscriptions = await getAllActiveSubscriptions();
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

  // Time window in minutes (send within 10 minutes of scheduled time)
  const sendWindowMinutes = 10;

  for (const sub of subscriptions) {
    try {
      const sendTime = sub.sendTime ?? "08:00";
      const [scheduledHour, scheduledMinute] = sendTime.split(":").map(Number);
      const scheduledMinutes = scheduledHour * 60 + scheduledMinute;
      const currentMinutes = currentHour * 60 + currentMinute;
      
      // Check if we're within the send window
      const timeDiff = Math.abs(currentMinutes - scheduledMinutes);
      const isInSendWindow = timeDiff <= sendWindowMinutes;

      // Check if already sent today (within this catch-up cycle)
      const today = new Date();
      const lastSentDate = sub.lastSentAt ? new Date(sub.lastSentAt) : null;
      const sentToday = lastSentDate && lastSentDate.toDateString() === today.toDateString();

      if (sub.frequency === "daily") {
        // CATCH-UP LOGIC: Check if we missed any days
        if (lastSentDate) {
          const daysSinceLastSent = Math.floor((now.getTime() - lastSentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceLastSent > 1) {
            // Missed one or more days - catch up each missed day
            console.log(`[digest] Catching up ${daysSinceLastSent - 1} day(s) for user ${sub.userId}`);
            
            for (let dayOffset = 1; dayOffset < daysSinceLastSent; dayOffset++) {
              const catchUpDate = new Date(now);
              catchUpDate.setDate(catchUpDate.getDate() - dayOffset);
              
              await sendDigestForDate(sub, catchUpDate);
            }
          }
        }

        // If already sent today, skip (but still check catch-up above)
        if (sentToday && !isInSendWindow) {
          continue;
        }

        // If in send window and not sent today, send today's digest
        if (isInSendWindow && !sentToday) {
          await sendDigestForDate(sub, now);
        }
      } else {
        // Weekly - just check send window
        if (isInSendWindow) {
          await sendDigestForDate(sub, now);
        }
      }
    } catch (err) {
      console.error(`[digest] Failed for user ${sub.userId}:`, err);
      // Continue with next subscription instead of stopping
    }
  }
}

/**
 * Send digest for a specific date
 */
async function sendDigestForDate(subscription: Awaited<ReturnType<typeof getAllActiveSubscriptions>>[0], date: Date) {
  const email = await getUserEmail(subscription.userId);
  if (!email) {
    console.log(`[digest] No email for user ${subscription.userId}`);
    return;
  }

  const articles = await getArticlesForEmailForDate(subscription.userId, date);
  
  const smtpConfig = subscription.smtpHost && subscription.smtpUser && subscription.smtpPass
    ? {
        host: subscription.smtpHost,
        port: subscription.smtpPort || 587,
        user: subscription.smtpUser,
        pass: subscription.smtpPass,
        from: subscription.smtpFrom || "Feedwise <noreply@feedwise.app>",
      }
    : null;

  const dateStr = date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  const subject = articles.length === 0
    ? `📰 Feedwise Digest - ${dateStr} - No new articles`
    : `📰 Feedwise Digest - ${dateStr} - ${articles.length} article${articles.length === 1 ? "" : "s"}`;

  await sendDailyDigest({
    to: email,
    subject,
    articles,
    smtpConfig,
  });

  await markDigestSent(subscription.userId);
  console.log(`[digest] Sent digest to ${email} (${articles.length} articles) for ${date.toDateString()}`);
}

/**
 * Get articles for a specific date (used for catch-up)
 */
async function getArticlesForEmailForDate(userId: string, date: Date): Promise<Awaited<ReturnType<typeof getArticlesForEmail>>> {
  const { getArticlesForEmail } = await import("@/lib/email/queries");
  return getArticlesForEmail(userId, date);
}
