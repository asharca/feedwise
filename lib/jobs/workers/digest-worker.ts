import { getAllActiveSubscriptions, getUserEmail, getArticlesForEmail, markDigestSent, getUserSMTPConfig } from "@/lib/email/queries";
import { sendDailyDigest } from "@/lib/email/sender";

export async function processDailyDigests() {
  const subscriptions = await getAllActiveSubscriptions();
  const today = new Date();
  const currentHour = today.getHours();
  const currentMinute = today.getMinutes();
  const currentTime = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

  for (const sub of subscriptions) {
    try {
      if (sub.sendTime !== currentTime) continue;

      if (sub.frequency === "daily") {
        const sentToday = sub.lastSentAt && sub.lastSentAt.toDateString() === today.toDateString();
        if (sentToday) continue;
      }

      const email = await getUserEmail(sub.userId);
      if (!email) {
        console.log(`[digest] No email for user ${sub.userId}`);
        continue;
      }

      const articles = await getArticlesForEmail(sub.userId);
      if (articles.length === 0) {
        console.log(`[digest] No articles for user ${sub.userId}`);
        continue;
      }

      const smtpConfig = sub.smtpHost && sub.smtpUser && sub.smtpPass
        ? {
            host: sub.smtpHost,
            port: sub.smtpPort || 587,
            user: sub.smtpUser,
            pass: sub.smtpPass,
            from: sub.smtpFrom || "Feedwise <noreply@feedwise.app>",
          }
        : null;

      const subject = articles.length === 0
        ? "📰 Your Feedwise Digest - No new articles today"
        : `📰 Your Feedwise Digest - ${articles.length} article${articles.length === 1 ? "" : "s"} today`;

      await sendDailyDigest({
        to: email,
        subject,
        articles,
        smtpConfig,
      });

      await markDigestSent(sub.userId);
      console.log(`[digest] Sent digest to ${email} (${articles.length} articles)`);
    } catch (err) {
      console.error(`[digest] Failed for user ${sub.userId}:`, err);
    }
  }
}
