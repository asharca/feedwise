import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getArticlesGroupedByFolder } from "@/lib/db/queries/articles";

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const grouped = await getArticlesGroupedByFolder(session.user.id);
    return NextResponse.json({ success: true, data: grouped });
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
