import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { updateUserLlmConfig } from "@/lib/email/queries";

const InputSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url().or(z.literal("")),
  apiKey: z.string().optional(),
  model: z.string().max(100),
});

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  await updateUserLlmConfig(session.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
