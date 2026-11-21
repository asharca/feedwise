import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { patchChannel, deleteChannel } from "@/lib/db/queries/notification-channels";
import { channelDto, mergeConfig, openConfig, patchSchema, sealConfig } from "@/lib/notify/config";

const missing = () => Response.json({ success: false, error: "通知渠道不存在" }, { status: 404 });
export const PATCH = withAuth(async (req, { user }, ctx) => {
  const id = z.uuid().parse((await ctx.params).id);
  const { config, ...fields } = patchSchema.parse(await req.json().catch(() => null));
  const row = await patchChannel(user.id, id, (current) =>
    config === undefined
      ? fields
      : {
          ...fields,
          config: sealConfig(current.type, mergeConfig(current.type, openConfig(current), config)),
        },
  );
  return row ? Response.json({ success: true, data: channelDto(row) }) : missing();
});

export const DELETE = withAuth(async (_req, { user }, ctx) => {
  const id = z.uuid().parse((await ctx.params).id);
  const row = await deleteChannel(user.id, id);
  return row ? Response.json({ success: true, data: row }) : missing();
});
