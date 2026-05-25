// app/api/r/route.ts
import { NextResponse } from "next/server";
import { verifyClickToken } from "@/lib/email/click-token";
import { getArticleUrlById, markArticle } from "@/lib/db/queries/articles";

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const home = (process.env.NEXT_PUBLIC_APP_URL || reqUrl.origin).replace(/\/$/, "") + "/";

  const token = reqUrl.searchParams.get("t");
  const parsed = token ? verifyClickToken(token) : null;
  if (!parsed) return NextResponse.redirect(home);

  const url = await getArticleUrlById(parsed.articleId);
  if (!url) return NextResponse.redirect(home);

  try {
    await markArticle(parsed.userId, parsed.articleId, { isStarred: true });
  } catch (err) {
    console.error("[click] auto-save failed:", err);
  }
  return NextResponse.redirect(url);
}
