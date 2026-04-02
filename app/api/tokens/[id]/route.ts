import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { deleteApiToken } from "@/lib/db/queries/api-tokens";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await deleteApiToken(session.user.id, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
