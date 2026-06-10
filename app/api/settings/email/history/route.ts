import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getDigestHistory } from "@/lib/email/digest-log";

export const GET = withAuth(async (_req, session) => {
  const history = await getDigestHistory(session.user.id, 30);
  return NextResponse.json({ success: true, data: history });
});
