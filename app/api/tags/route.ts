import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getUserTagsWithCounts } from "@/lib/db/queries/articles";

export const GET = withAuth(async (_req, session) => {
  const userTags = await getUserTagsWithCounts(session.user.id);
  return NextResponse.json({ success: true, data: userTags });
});
