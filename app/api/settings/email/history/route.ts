import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDigestHistory } from "@/lib/email/queries";

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const history = await getDigestHistory(session.user.id, 30);
  return NextResponse.json({ success: true, data: history });
}
