import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getArticlesGroupedByFolder } from "@/lib/db/queries/articles";

export const GET = withAuth(async (_req, session) => {
  const grouped = await getArticlesGroupedByFolder(session.user.id);
  return NextResponse.json({ success: true, data: grouped });
});
