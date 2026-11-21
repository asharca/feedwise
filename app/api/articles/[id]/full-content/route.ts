import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { fetchFullText } from "@/lib/articles/fulltext";

export const POST = withAuth(async (_req, session, ctx) => {
  const id = z
    .string()
    .uuid()
    .parse((await ctx.params).id);
  const data = await fetchFullText(id, session.user.id);
  if (!data) return Response.json({ success: false, error: "文章不存在" }, { status: 404 });
  return Response.json({ success: true, data });
});
