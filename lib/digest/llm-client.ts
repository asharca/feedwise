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

export interface LlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatCompletionInput {
  system: string;
  user: string;
  jsonSchema: { name: string; schema: unknown };
}

export async function callChatCompletion(
  config: LlmClientConfig,
  input: ChatCompletionInput
): Promise<unknown> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
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

  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new LlmParseError("Response body is not JSON", "");
  }
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LlmParseError("Missing message.content", JSON.stringify(json));
  }
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
