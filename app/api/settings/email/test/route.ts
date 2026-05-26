import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserEmail, getArticlesForEmail, getUserSMTPConfig } from "@/lib/email/queries";
import { sendDailyDigest } from "@/lib/email/sender";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import { buildFallback } from "@/lib/digest/fallback";

export async function POST() {
  try {
    const session = await requireSession();

    const email = await getUserEmail(session.user.id);
    if (!email) {
      return NextResponse.json({ success: false, error: "No email found" }, { status: 400 });
    }

    const articles = await getArticlesForEmail(session.user.id);
    const smtpConfig = await getUserSMTPConfig(session.user.id);

    // Check if SMTP is configured
    if (!smtpConfig) {
      return NextResponse.json({
        success: false,
        error: "SMTP not configured. Please configure your SMTP settings in the email settings.",
      }, { status: 400 });
    }

    console.log(`[test-digest] Sending test email to ${email} with ${articles.length} articles`);
    console.log(`[test-digest] SMTP config: ${smtpConfig.host}:${smtpConfig.port}`);

    const subject = articles.length === 0
      ? "📰 Your Feedwise Digest - No new articles today"
      : `📰 Your Feedwise Digest - ${articles.length} article${articles.length === 1 ? "" : "s"} today`;

    const digest = buildFallback(
      articles.map((a) => ({ primary: a, duplicates: [] })),
      "no-config"
    );
    const html = renderFallbackHtml(digest);

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

    // Provide more specific error messages
    let errorMessage = "Failed to send test email";
    if (err instanceof Error) {
      if (err.message.includes("ENETUNREACH")) {
        errorMessage = "Cannot connect to SMTP server. Please check your SMTP host and port settings.";
      } else if (err.message.includes("EAUTH")) {
        errorMessage = "SMTP authentication failed. Please check your username and password.";
      } else if (err.message.includes("Mail from address must be same as authorization user")) {
        errorMessage = "QQ Mail requires the sender address to match the SMTP username. Please set both to the same QQ email address.";
      } else if (err.message.includes("ETIMEDOUT")) {
        errorMessage = "SMTP connection timed out. Please check your SMTP server settings.";
      } else {
        errorMessage = `SMTP Error: ${err.message}`;
      }
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
