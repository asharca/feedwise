// app/api/settings/email/history/[logId]/preview/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import {
  getArticlesForLog,
  getDigestLogById,
  getSubscriptionSettings,
} from "@/lib/email/queries";
import { assembleDigestForSubscription } from "@/lib/jobs/workers/digest-worker";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import { buildEmailLinkFn } from "@/lib/email/click-link";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ logId: string }> }
) {
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

  const articles = await getArticlesForLog(logId, session.user.id);

  if (articles.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        mode: "empty",
        html: "<p style='font-family:sans-serif;padding:24px;color:#6b6b6b;'>No articles in this digest.</p>",
        articleCount: 0,
        sentAt: log.sentAt,
        status: log.status,
      },
    });
  }

  const { digest } = await assembleDigestForSubscription(session.user.id, articles);
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

  return NextResponse.json({
    success: true,
    data: {
      mode: digest.mode,
      html,
      articleCount: articles.length,
      sentAt: log.sentAt,
      status: log.status,
    },
  });
}
