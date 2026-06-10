import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getArticleById, markArticle } from "@/lib/db/queries/articles";

const PatchSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  readProgress: z.number().min(0).max(1).optional(),
});

export const GET = withAuth(async (_req, session, ctx) => {
  const { id } = await ctx.params;
  const article = await getArticleById(session.user.id, id);
  if (!article) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: article });
});

export const PATCH = withAuth(async (req, session, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const data = PatchSchema.parse(body);
  await markArticle(session.user.id, id, data);
  return NextResponse.json({ success: true });
});
