import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { markAllRead } from "@/lib/db/queries/articles";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const feedId = searchParams.get("feedId") ?? undefined;
    const folderId = searchParams.get("folderId") ?? undefined;
    await markAllRead(session.user.id, feedId, folderId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
