// app/api/settings/email/history/[logId]/resend/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getArticlesForLog, getDigestLogById, logDigestSendWithArticles } from "@/lib/email/digest-log";
import { getSubscriptionSettings, getUserEmail, getUserSMTPConfig } from "@/lib/email/subscription-settings";
import {
  assembleDigestForSubscription,
  sendDailyDigestWithRetry,
} from "@/lib/jobs/workers/digest-worker";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import { buildEmailLinkFn } from "@/lib/email/click-link";
import { mapSmtpError } from "@/lib/email/smtp-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ logId: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { logId } = await ctx.params;
  if (!UUID_RE.test(logId)) {
    return NextResponse.json({ success: false, error: "Invalid log id" }, { status: 400 });
  }

  const log = await getDigestLogById(logId, session.user.id);
  if (!log) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const articleIds = await getArticlesForLog(logId, session.user.id);
  if (articleIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Nothing to resend — the original digest had no articles" },
      { status: 400 },
    );
  }

  const smtpConfig = await getUserSMTPConfig(session.user.id);
  if (!smtpConfig) {
    return NextResponse.json(
      {
        success: false,
        error: "SMTP not configured. Please configure your SMTP settings in the email settings.",
      },
      { status: 400 },
    );
  }

  const to = await getUserEmail(session.user.id);
  if (!to) {
    return NextResponse.json({ success: false, error: "No email found" }, { status: 400 });
  }

  const { digest } = await assembleDigestForSubscription(session.user.id, articleIds);
  const settings = await getSubscriptionSettings(session.user.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const buildLink = buildEmailLinkFn(session.user.id, appUrl, {
    markReadOnClick: settings?.markReadOnClick,
    autoSaveOnClick: settings?.autoSaveOnClick,
  });

  const html =
    digest.mode === "clustered"
      ? await renderDigestHtml(digest, buildLink)
      : await renderFallbackHtml(digest, buildLink);

  const subject = `📰 Your Feedwise Digest - Resent - ${articleIds.length} article${articleIds.length === 1 ? "" : "s"}`;

  try {
    await sendDailyDigestWithRetry({ to, subject, html, smtpConfig });
    const newLogId = await logDigestSendWithArticles(
      session.user.id,
      articleIds.map((a) => a.id),
      articleIds.length,
      "success",
    );
    return NextResponse.json({
      success: true,
      data: { sentTo: to, articleCount: articleIds.length, newLogId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[digest-history-resend] logId=${logId} userId=${session.user.id}:`, err);
    await logDigestSendWithArticles(
      session.user.id,
      articleIds.map((a) => a.id),
      articleIds.length,
      "failed",
      message,
    );
    return NextResponse.json({ success: false, error: mapSmtpError(err) }, { status: 500 });
  }
}
