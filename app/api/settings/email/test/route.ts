import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import {
  getUserEmail,
  getArticlesForEmail,
  getUserSMTPConfig,
  getSubscriptionSettings,
} from "@/lib/email/queries";
import { sendDailyDigest } from "@/lib/email/sender";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import { buildFallback } from "@/lib/digest/fallback";
import { buildEmailLinkFn } from "@/lib/email/click-link";
import { mapSmtpError } from "@/lib/email/smtp-error";

export async function POST(req: Request) {
  try {
    const session = await requireSession();

    const email = await getUserEmail(session.user.id);
    if (!email) {
      return NextResponse.json({ success: false, error: "No email found" }, { status: 400 });
    }

    const articles = await getArticlesForEmail(session.user.id);
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

    console.log(`[test-digest] Sending test email to ${email} with ${articles.length} articles`);
    console.log(`[test-digest] SMTP config: ${smtpConfig.host}:${smtpConfig.port}`);

    const subject =
      articles.length === 0
        ? "📰 Your Feedwise Digest - No new articles today"
        : `📰 Your Feedwise Digest - ${articles.length} article${articles.length === 1 ? "" : "s"} today`;

    const digest = buildFallback(
      articles.map((a) => ({ primary: a, duplicates: [] })),
      "no-config",
    );

    // Honor the user's click-behavior settings (mark-read / star). When
    // NEXT_PUBLIC_APP_URL isn't configured we fall back to the request's
    // origin so the test email still has a working /api/r redirect to come
    // back to.
    const settings = await getSubscriptionSettings(session.user.id);
    const reqOrigin = new URL(req.url).origin;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || reqOrigin;
    const buildLink = buildEmailLinkFn(session.user.id, appUrl, {
      markReadOnClick: settings?.markReadOnClick,
      autoSaveOnClick: settings?.autoSaveOnClick,
    });

    const html = await renderFallbackHtml(digest, buildLink);

    await sendDailyDigest({
      to: email,
      subject,
      html,
      smtpConfig,
    });

    return NextResponse.json({
      success: true,
      data: {
        sentTo: email,
        articleCount: articles.length,
        smtpHost: smtpConfig.host,
        smtpPort: smtpConfig.port,
      },
    });
  } catch (err) {
    console.error("[test-digest] Error:", err);
    const errorMessage = mapSmtpError(err);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
