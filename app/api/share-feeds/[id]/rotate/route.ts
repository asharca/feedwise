import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { json } from "@/lib/client-api/http";
import { updateShareFeed } from "@/lib/db/queries/share-feeds";
import { newShareToken, shareDto } from "@/lib/share/feed";

export const POST = withAuth(async (req, { user }, ctx) => {
  const row = await updateShareFeed(user.id, z.uuid().parse((await ctx.params).id), {
    token: newShareToken(),
  });
  return row
    ? json({ success: true, data: shareDto(req, row) })
    : json({ success: false, error: "分享源不存在" }, 404);
});
