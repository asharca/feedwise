import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getUserLlmConfig } from "@/lib/email/queries";

const TIMEOUT_MS = 15_000;

const InputSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  format: z.enum(["openai", "anthropic"]).optional(),
});

interface UpstreamModelsResponse {
  data?: Array<{ id?: unknown; display_name?: unknown }>;
}

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

  const baseUrl = parsed.data.baseUrl.replace(/\/$/, "");
  const format = parsed.data.format ?? "openai";

  const url = `${baseUrl}/models`;
  const headers: Record<string, string> =
    format === "anthropic"
      ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${apiKey}` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message.slice(0, 200) }, { status: 502 });
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `HTTP ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 }
    );
  }

  let json: UpstreamModelsResponse;
  try {
    json = (await res.json()) as UpstreamModelsResponse;
  } catch {
    return NextResponse.json({ error: "Upstream response was not JSON" }, { status: 502 });
  }

  const raw = Array.isArray(json.data) ? json.data : [];
  const models = raw
    .map((m) => {
      const id = typeof m?.id === "string" ? m.id : "";
      const displayName = typeof m?.display_name === "string" ? m.display_name : "";
      return { id, displayName: displayName || id };
    })
    .filter((m) => m.id.length > 0)
    // De-dupe by id, preserving first occurrence
    .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
    .sort((a, b) => a.id.localeCompare(b.id));

  return NextResponse.json({ ok: true, models });
}
