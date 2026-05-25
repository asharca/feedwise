import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callChatCompletion,
  withLlmRetry,
  LlmTimeoutError,
  LlmRateLimitError,
  LlmHttpError,
  LlmParseError,
} from "@/lib/digest/llm-client";

const CONFIG = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
};

describe("callChatCompletion", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it("posts to baseUrl/chat/completions with auth + body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const out = await callChatCompletion(CONFIG, {
      system: "sys",
      user: "user",
      jsonSchema: { name: "X", schema: { type: "object" } },
    });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1]).toEqual({ role: "user", content: "user" });
    expect(body.response_format).toBeDefined();
  });

  it("throws LlmTimeoutError after 30 s", async () => {
    globalThis.fetch = vi.fn((_url, init: RequestInit | undefined) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })
    ) as unknown as typeof fetch;
    const p = callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } });
    const expectation = expect(p).rejects.toBeInstanceOf(LlmTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await expectation;
  });

  it("throws LlmRateLimitError on 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("rate limited", { status: 429 })
    ) as unknown as typeof fetch;
    await expect(
      callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } })
    ).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("throws LlmHttpError on other non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("server error", { status: 500 })
    ) as unknown as typeof fetch;
    await expect(
      callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } })
    ).rejects.toBeInstanceOf(LlmHttpError);
  });

  it("throws LlmParseError on non-JSON content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;
    await expect(
      callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } })
    ).rejects.toBeInstanceOf(LlmParseError);
  });
});

describe("withLlmRetry", () => {
  it("retries transient errors then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new LlmTimeoutError())
      .mockRejectedValueOnce(new LlmRateLimitError())
      .mockResolvedValue("ok");
    const out = await withLlmRetry(fn, { retries: 2, baseDelayMs: 0 });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new LlmHttpError(400, "bad"));
    await expect(withLlmRetry(fn, { retries: 2, baseDelayMs: 0 })).rejects.toBeInstanceOf(LlmHttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new LlmTimeoutError());
    await expect(withLlmRetry(fn, { retries: 1, baseDelayMs: 0 })).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
