const TIMEOUT_MS = 30_000;

export class LlmTimeoutError extends Error {
  constructor() {
    super(`LLM request exceeded ${TIMEOUT_MS}ms`);
    this.name = "LlmTimeoutError";
  }
}
export class LlmRateLimitError extends Error {
  constructor() {
    super("LLM rate limited (429)");
    this.name = "LlmRateLimitError";
  }
}
export class LlmHttpError extends Error {
  constructor(public status: number, body: string) {
    super(`LLM HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "LlmHttpError";
  }
}
export class LlmParseError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
    this.name = "LlmParseError";
  }
}

export type LlmFormat = "openai" | "anthropic";

export interface LlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  format: LlmFormat;
}

export interface ChatCompletionInput {
  system: string;
  user: string;
  jsonSchema: { name: string; schema: unknown };
}

function buildOpenAiBody(config: LlmClientConfig, input: ChatCompletionInput) {
  return {
    model: config.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: input.jsonSchema.name, schema: input.jsonSchema.schema, strict: false },
    },
    temperature: 0.2,
  };
}

function buildAnthropicBody(config: LlmClientConfig, input: ChatCompletionInput) {
  const system = `${input.system}\n\nYou must respond with valid JSON matching this schema:\n${JSON.stringify(input.jsonSchema.schema)}`;
  return {
    model: config.model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: input.user }],
    temperature: 0.2,
  };
}

function parseOpenAiResponse(json: unknown): string {
  const typed = json as { choices?: Array<{ message?: { content?: string } }> };
  const content = typed.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LlmParseError("Missing message.content", JSON.stringify(json));
  }
  return content;
}

function parseAnthropicResponse(json: unknown): string {
  const typed = json as {
    content?: string | Array<{ type?: string; text?: string }>;
    error?: { message?: string; type?: string };
  };

  // Some endpoints return upstream errors with status 200 but an `error` envelope.
  if (typed.error && typeof typed.error.message === "string") {
    throw new LlmParseError(`Upstream error: ${typed.error.message}`, JSON.stringify(json));
  }

  // Some Anthropic-compatible proxies return content as a plain string.
  if (typeof typed.content === "string") {
    return typed.content;
  }

  if (!Array.isArray(typed.content)) {
    throw new LlmParseError(
      `Anthropic response had no content array`,
      JSON.stringify(json).slice(0, 500)
    );
  }

  // Find ALL text blocks — Claude may return thinking/tool_use blocks before
  // (or after) the actual text; we want the text wherever it appears.
  const textBlocks = typed.content.filter(
    (b): b is { type: string; text: string } =>
      b?.type === "text" && typeof b.text === "string"
  );

  if (textBlocks.length === 0) {
    const seenTypes = typed.content.map((b) => b?.type ?? "?").join(", ");
    throw new LlmParseError(
      `No text block in Anthropic content (got: ${seenTypes || "empty"})`,
      JSON.stringify(json).slice(0, 500)
    );
  }

  return textBlocks.map((b) => b.text).join("\n");
}

/**
 * Pull a JSON value out of LLM text. Tries:
 *   1. The text as-is.
 *   2. Inside a ```json ... ``` (or ``` ... ```) code fence.
 *   3. The first {...} or [...] substring.
 *
 * Needed because the Anthropic Messages API has no native JSON-schema mode, so
 * we ask via the system prompt — models often wrap the answer in markdown or
 * add prose around it.
 */
export function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // fall through
    }
  }

  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      // fall through
    }
  }

  throw new LlmParseError("Could not extract JSON from response text", trimmed.slice(0, 500));
}

export async function callChatCompletion(
  config: LlmClientConfig,
  input: ChatCompletionInput
): Promise<unknown> {
  const format = config.format ?? "openai";
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  let url: string;
  let body: unknown;
  let headers: Record<string, string>;

  if (format === "anthropic") {
    url = `${baseUrl}/messages`;
    body = buildAnthropicBody(config, input);
    headers = {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    };
  } else {
    url = `${baseUrl}/chat/completions`;
    body = buildOpenAiBody(config, input);
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new LlmTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new LlmRateLimitError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmHttpError(res.status, text);
  }

  const responseText = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new LlmParseError("Response body is not JSON", responseText.slice(0, 500));
  }

  const content = format === "anthropic" ? parseAnthropicResponse(json) : parseOpenAiResponse(json);
  return extractJsonFromText(content);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
}

/** Retry a fn on transient LLM errors (timeout, 429) with exponential backoff. */
export async function withLlmRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const retries = Math.max(0, opts.retries ?? 2);
  const baseDelayMs = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = err instanceof LlmTimeoutError || err instanceof LlmRateLimitError;
      if (!transient || attempt === retries) throw err;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastErr;
}
