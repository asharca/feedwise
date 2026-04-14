import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await requireSession();
    const userTags = await db.select().from(tags).where(eq(tags.userId, session.user.id));
    return NextResponse.json({ success: true, data: userTags });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
