import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const SettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export type UserSettings = z.infer<typeof SettingsSchema>;

export async function GET() {
  try {
    const session = await requireSession();
    const [user] = await db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, session.user.id));
    return NextResponse.json({ success: true, data: user?.settings ?? {} });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const patch = SettingsSchema.parse(body);

    const [user] = await db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, session.user.id));

    const merged = { ...(user?.settings ?? {}), ...patch };

    await db
      .update(users)
      .set({ settings: merged })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
