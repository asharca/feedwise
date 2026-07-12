import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getArticles } from "@/lib/db/queries/articles";

export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);

  const searchQuery = searchParams.get("search")?.trim() || undefined;
  const sinceValue = z
    .union([z.enum(["today", "7d", "30d"]), z.string().datetime()])
    .optional()
    .parse(searchParams.get("since") ?? undefined);
  const sinceDays = sinceValue === "today" ? 1 : sinceValue === "7d" ? 7 : 30;
  const since = sinceValue
    ? sinceValue === "today" || sinceValue === "7d" || sinceValue === "30d"
      ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
      : new Date(sinceValue)
    : undefined;

  const articles = await getArticles(session.user.id, {
    feedId: searchParams.get("feedId") ?? undefined,
    folderId: searchParams.get("folderId") ?? undefined,
    tagId: searchParams.get("tag") ?? undefined,
    unreadOnly: searchParams.get("unread") === "true",
    starredOnly: searchParams.get("starred") === "true",
    since,
    search: searchQuery,
    limit: Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200),
    offset: parseInt(searchParams.get("offset") ?? "0", 10) || 0,
  });

  return NextResponse.json({ success: true, data: articles });
});
