import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getReadingHistory } from "@/lib/db/queries/articles";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const rows = await getReadingHistory(session.user.id, {
      search: searchParams.get("search")?.trim() || undefined,
      limit: Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200),
      offset: parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    });

    return NextResponse.json({ success: true, data: rows });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
