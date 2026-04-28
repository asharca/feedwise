import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getArticles } from "@/lib/db/queries/articles";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const searchQuery = searchParams.get("search")?.trim() || undefined;

    const articles = await getArticles(session.user.id, {
      feedId: searchParams.get("feedId") ?? undefined,
      folderId: searchParams.get("folderId") ?? undefined,
      unreadOnly: searchParams.get("unread") === "true",
      starredOnly: searchParams.get("starred") === "true",
      search: searchQuery,
      limit: Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200),
      offset: parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    });

    return NextResponse.json({ success: true, data: articles });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
