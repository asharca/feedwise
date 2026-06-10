import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getArticleById, removeTagFromArticle } from "@/lib/db/queries/articles";

export const DELETE = withAuth(async (_req, session, ctx) => {
  const { id, tagId } = await ctx.params;

  // Article ownership check (also confirms the subscription join)
  const article = await getArticleById(session.user.id, id);
  if (!article) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const ok = await removeTagFromArticle(session.user.id, id, tagId);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Tag not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
});
