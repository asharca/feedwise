import { withAuth } from "@/lib/api/with-auth";
import { createChannel, listChannels } from "@/lib/db/queries/notification-channels";
import { channelDto, createSchema, mergeConfig, sealConfig } from "@/lib/notify/config";

export const GET = withAuth(async (_req, { user }) => {
  return Response.json({ success: true, data: (await listChannels(user.id)).map(channelDto) });
});

export const POST = withAuth(async (req, { user }) => {
  const { name, type, config } = createSchema.parse(await req.json().catch(() => null));
  const row = await createChannel(
    user.id,
    type,
    name,
    sealConfig(type, mergeConfig(type, {}, config)),
  );
  return Response.json({ success: true, data: channelDto(row) });
});
