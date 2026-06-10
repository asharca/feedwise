import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getReadingHistory } from "@/lib/db/queries/articles";

export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);

  const rows = await getReadingHistory(session.user.id, {
    search: searchParams.get("search")?.trim() || undefined,
    limit: Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200),
    offset: parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  });

  return NextResponse.json({ success: true, data: rows });
});
