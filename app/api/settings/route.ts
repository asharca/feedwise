import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const SettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export type UserSettings = z.infer<typeof SettingsSchema>;

export const GET = withAuth(async (_req, session) => {
  const [user] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, session.user.id));
  return NextResponse.json({ success: true, data: user?.settings ?? {} });
});

export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const patch = SettingsSchema.parse(body);

  const [user] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, session.user.id));

  const merged = { ...(user?.settings ?? {}), ...patch };

  await db.update(users).set({ settings: merged }).where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true, data: merged });
});
