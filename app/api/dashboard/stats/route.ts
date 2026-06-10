import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getDashboardStats } from "@/lib/db/queries/stats";

export const GET = withAuth(async (_req, session) => {
  const stats = await getDashboardStats(session.user.id);
  return NextResponse.json({ success: true, data: stats });
});
