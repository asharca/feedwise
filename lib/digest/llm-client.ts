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
  const typed = json as { content?: Array<{ type?: string; text?: string }> };
  const block = typed.content?.[0];
  if (block?.type !== "text" || typeof block.text !== "string") {
    throw new LlmParseError("Missing content[0].text", JSON.stringify(json));
  }
  return block.text;
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
  try {
    return JSON.parse(content);
  } catch {
    throw new LlmParseError("message.content is not valid JSON", content);
  }
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
