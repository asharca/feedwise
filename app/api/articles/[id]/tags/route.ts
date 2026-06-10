import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { addTagToArticle, getArticleById } from "@/lib/db/queries/articles";

const AddTagSchema = z.object({
  name: z.string().min(1).max(100),
});

export const POST = withAuth(async (req, session, ctx) => {
  const { id } = await ctx.params;

  // Ownership check
  const article = await getArticleById(session.user.id, id);
  if (!article) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name } = AddTagSchema.parse(body);
  const tag = await addTagToArticle(session.user.id, id, name);
  return NextResponse.json({ success: true, data: tag });
});
