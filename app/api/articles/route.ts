import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getArticles } from "@/lib/db/queries/articles";

export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);

  const searchQuery = searchParams.get("search")?.trim() || undefined;

  const articles = await getArticles(session.user.id, {
    feedId: searchParams.get("feedId") ?? undefined,
    folderId: searchParams.get("folderId") ?? undefined,
    tagId: searchParams.get("tag") ?? undefined,
    unreadOnly: searchParams.get("unread") === "true",
    starredOnly: searchParams.get("starred") === "true",
    search: searchQuery,
    limit: Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200),
    offset: parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  });

  return NextResponse.json({ success: true, data: articles });
});
