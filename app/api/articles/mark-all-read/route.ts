import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { markAllRead } from "@/lib/db/queries/articles";

export const POST = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const feedId = searchParams.get("feedId") ?? undefined;
  const folderId = searchParams.get("folderId") ?? undefined;
  await markAllRead(session.user.id, feedId, folderId);
  return NextResponse.json({ success: true });
});
