import { withAuth } from "@/lib/api/with-auth";
import { json } from "@/lib/client-api/http";
import { listShareFeeds, createShareFeed } from "@/lib/db/queries/share-feeds";
import { shareSchema, shareDto, newShareToken } from "@/lib/share/feed";

export const GET = withAuth(async (req, { user }) => {
  const rows = await listShareFeeds(user.id);
  return json({ success: true, data: rows.map((row) => shareDto(req, row)) });
});

export const POST = withAuth(async (req, { user }) => {
  const { name, filter } = shareSchema.parse(await req.json().catch(() => null));
  const row = await createShareFeed(user.id, name, filter, newShareToken());
  return json({ success: true, data: shareDto(req, row) }, 201);
});
