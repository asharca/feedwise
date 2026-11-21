import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { relatedArticles } from "@/lib/dedupe/related";

export const GET = withAuth(async (_req, session, ctx) => {
  const id = z
    .string()
    .uuid()
    .parse((await ctx.params).id);
  const data = await relatedArticles(session.user.id, id);
  if (!data) return Response.json({ success: false, error: "文章不存在" }, { status: 404 });
  return Response.json({ success: true, data });
});
