import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getReadingHistory } from "@/lib/db/queries/articles";
import { parsePageParams } from "@/lib/search/article-cursor";

export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);

  const rows = await getReadingHistory(session.user.id, {
    search: searchParams.get("search")?.trim() || undefined,
    ...parsePageParams(searchParams),
  });

  return NextResponse.json({ success: true, data: rows });
});
