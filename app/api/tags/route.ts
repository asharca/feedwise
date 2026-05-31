import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserTagsWithCounts } from "@/lib/db/queries/articles";

export async function GET() {
  try {
    const session = await requireSession();
    const userTags = await getUserTagsWithCounts(session.user.id);
    return NextResponse.json({ success: true, data: userTags });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
