import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getUserLlmConfig, updateUserLlmConfig } from "@/lib/email/queries";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await getUserLlmConfig(session.user.id);
  if (!cfg) {
    return NextResponse.json({
      enabled: false,
      baseUrl: "",
      apiKeyMask: "",
      model: "",
      format: "openai",
    });
  }
  const k = cfg.apiKey;
  const apiKeyMask = k.length >= 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "•••";
  return NextResponse.json({
    enabled: cfg.enabled,
    baseUrl: cfg.baseUrl,
    apiKeyMask,
    model: cfg.model,
    format: cfg.format,
  });
}

const InputSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url().or(z.literal("")),
  apiKey: z.string().optional(),
  model: z.string().max(100),
  format: z.enum(["openai", "anthropic"]).optional(),
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
