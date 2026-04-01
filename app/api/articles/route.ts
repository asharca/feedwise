import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getArticles } from "@/lib/db/queries/articles";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const articles = await getArticles(session.user.id, {
      feedId: searchParams.get("feedId") ?? undefined,
      unreadOnly: searchParams.get("unread") === "true",
      starredOnly: searchParams.get("starred") === "true",
      limit: Number(searchParams.get("limit") ?? 50),
      offset: Number(searchParams.get("offset") ?? 0),
    });

    return NextResponse.json({ success: true, data: articles });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
