import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getArticlesForEmail } from "@/lib/email/digest-articles";
import { assembleDigestForSubscription } from "@/lib/jobs/workers/digest-worker";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import type { DigestArticle } from "@/lib/digest/types";

const PREVIEW_WINDOW_HOURS = 24;

export const POST = withAuth(async (_req, session) => {
  const now = new Date();
  const fromDate = new Date(now.getTime() - PREVIEW_WINDOW_HOURS * 60 * 60 * 1000);

  const articles = await getArticlesForEmail(session.user.id, fromDate, now);

  if (articles.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        mode: "empty",
        html: "<p style='font-family:sans-serif;padding:24px;color:#6b6b6b;'>No articles in the last 24 hours.</p>",
        articleCount: 0,
      },
    });
  }

  // No more synchronous LLM call: the digest is built from per-article tags
  // and summaries that background workers populate over time, so the preview
  // returns in milliseconds.
  const { digest } = await assembleDigestForSubscription(session.user.id, articles);
  const buildLink = (a: DigestArticle) => a.url ?? "";
  const html = await renderDigestHtml(digest, buildLink);

  return NextResponse.json({
    success: true,
    data: { mode: digest.mode, html, articleCount: articles.length },
  });
});
