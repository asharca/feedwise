// app/api/r/route.ts
import { NextResponse } from "next/server";
import { verifyClickToken } from "@/lib/email/click-token";
import { getArticleUrlById, markArticle } from "@/lib/db/queries/articles";
import { getSubscriptionSettings } from "@/lib/email/queries";

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const home = (process.env.NEXT_PUBLIC_APP_URL || reqUrl.origin).replace(/\/$/, "") + "/";

  const token = reqUrl.searchParams.get("t");
  const parsed = token ? verifyClickToken(token) : null;
  if (!parsed) return NextResponse.redirect(home);

  const url = await getArticleUrlById(parsed.articleId);
  if (!url) return NextResponse.redirect(home);

  // Decide what side-effects to apply from the user's click-behaviour settings.
  // Defaults are conservative: mark read = true (matches user expectation
  // "I clicked through, so I read it"), star = false.
  let markRead = true;
  let star = false;
  try {
    const settings = await getSubscriptionSettings(parsed.userId);
    if (settings) {
      markRead = settings.markReadOnClick ?? true;
      star = settings.autoSaveOnClick ?? false;
    }
  } catch (err) {
    console.error("[click] failed to load user click prefs:", err);
  }

  const patch: { isRead?: boolean; isStarred?: boolean } = {};
  if (markRead) patch.isRead = true;
  if (star) patch.isStarred = true;

  if (Object.keys(patch).length > 0) {
    try {
      await markArticle(parsed.userId, parsed.articleId, patch);
    } catch (err) {
      console.error("[click] markArticle failed:", err);
    }
  }
  return NextResponse.redirect(url);
}
