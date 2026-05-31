import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/db/queries/stats";

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const stats = await getDashboardStats(session.user.id);
  return NextResponse.json({ success: true, data: stats });
}
