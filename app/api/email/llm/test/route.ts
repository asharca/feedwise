import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { callChatCompletion, LlmTimeoutError } from "@/lib/digest/llm-client";

const InputSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  format: z.enum(["openai", "anthropic"]).optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  let apiKey = parsed.data.apiKey;
  if (!apiKey) {
    const stored = await getUserLlmConfig(session.user.id);
    if (!stored || !stored.apiKey) {
      return NextResponse.json({ error: "no api key provided or stored" }, { status: 400 });
    }
    apiKey = stored.apiKey;
  }

  try {
    const reply = await callChatCompletion(
      {
        baseUrl: parsed.data.baseUrl,
        apiKey,
        model: parsed.data.model,
        format: parsed.data.format ?? "openai",
      },
      {
        system: "You are a test ping. Reply with valid JSON only.",
        user: 'Reply with JSON {"ok": true}',
        jsonSchema: {
          name: "Ping",
          schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        },
      },
    );
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    if (err instanceof LlmTimeoutError) {
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message.slice(0, 200) }, { status: 502 });
  }
}
