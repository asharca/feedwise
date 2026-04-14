import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getSubscriptionSettings, updateSubscriptionSettings } from "@/lib/email/queries";
import { z } from "zod";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  sendTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  selectedTags: z.array(z.string()).optional(),
  selectedFeeds: z.array(z.string()).optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),
  emailProvider: z.string().optional(),
  emailApiKey: z.string().optional(),
});

function sanitizeSettings(
  settings: Awaited<ReturnType<typeof getSubscriptionSettings>>
) {
  if (!settings) return settings;

  const hasSmtpPass = Boolean(settings.smtpPass && settings.smtpPass.trim().length > 0);
  const sanitized = {
    ...settings,
    hasSmtpPass,
  };
  delete (sanitized as { smtpPass?: string | null }).smtpPass;
  return sanitized;
}

export async function GET() {
  try {
    const session = await requireSession();
    const settings = await getSubscriptionSettings(session.user.id);
    return NextResponse.json({ success: true, data: sanitizeSettings(settings) });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = updateSchema.parse(body);

    const settings = await updateSubscriptionSettings(session.user.id, parsed);
    return NextResponse.json({ success: true, data: sanitizeSettings(settings) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email-settings] Error:", message);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.issues }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
