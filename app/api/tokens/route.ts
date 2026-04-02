import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { createApiToken, listApiTokens } from "@/lib/db/queries/api-tokens";

export async function GET() {
  try {
    const session = await requireSession();
    const tokens = await listApiTokens(session.user.id);
    return NextResponse.json({ success: true, data: tokens });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const { name } = await req.json() as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }
    const result = await createApiToken(session.user.id, name.trim());
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
