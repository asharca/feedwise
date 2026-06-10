import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getUserSettings, patchUserSettings } from "@/lib/db/queries/account";

const SettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export type UserSettings = z.infer<typeof SettingsSchema>;

export const GET = withAuth(async (_req, session) => {
  const settings = await getUserSettings(session.user.id);
  return NextResponse.json({ success: true, data: settings });
});

export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const patch = SettingsSchema.parse(body);
  const merged = await patchUserSettings(session.user.id, patch);
  return NextResponse.json({ success: true, data: merged });
});
