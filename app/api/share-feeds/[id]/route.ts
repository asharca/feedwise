import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { json } from "@/lib/client-api/http";
import { deleteShareFeed, updateShareFeed } from "@/lib/db/queries/share-feeds";
import { shareSchema, shareDto } from "@/lib/share/feed";

export const DELETE = withAuth(async (_req, { user }, ctx) => {
  const row = await deleteShareFeed(user.id, z.uuid().parse((await ctx.params).id));
  return row
    ? json({ success: true, data: row })
    : json({ success: false, error: "分享源不存在" }, 404);
});

export const PATCH = withAuth(async (req, { user }, ctx) => {
  const edit = shareSchema
    .partial()
    .refine((body) => body.name !== undefined || body.filter !== undefined)
    .parse(await req.json().catch(() => null));
  const row = await updateShareFeed(user.id, z.uuid().parse((await ctx.params).id), edit);
  return row
    ? json({ success: true, data: shareDto(req, row) })
    : json({ success: false, error: "分享源不存在" }, 404);
});
