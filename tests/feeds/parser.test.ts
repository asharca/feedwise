import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout, preflightFeed } from "@/lib/feeds/parser";
import { FeedError } from "@/lib/feeds/feed-error";

describe("withTimeout", () => {
  it("resolves the inner promise when it wins", async () => {
    const result = await withTimeout(Promise.resolve(42), 50);
    expect(result).toBe(42);
  });

  it("rejects with FeedError(timeout) when the timer fires", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 100));
    await expect(withTimeout(slow, 10)).rejects.toMatchObject({
      name: "FeedError",
      code: "timeout",
    });
  });

  it("classifies inner-promise rejections via classifyError", async () => {
    const inner = Promise.reject(new Error("Not a feed"));
    await expect(withTimeout(inner, 100)).rejects.toMatchObject({
      name: "FeedError",
      code: "parse",
    });
  });
});

describe("preflightFeed", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  function mockFetch(
    status: number,
    {
      contentType = "application/xml",
      body = "<rss><channel></channel></rss>",
    }: { contentType?: string; body?: string } = {}
  ) {
    globalThis.fetch = vi.fn(async () => {
      return new Response(body, {
        status,
        headers: { "content-type": contentType },
      });
    }) as unknown as typeof fetch;
  }

  it("resolves when status is 200 and content-type looks like a feed", async () => {
    mockFetch(200, { contentType: "application/rss+xml" });
    await expect(preflightFeed("https://example.com/feed.xml", 100)).resolves.toBeUndefined();
  });

  it("accepts text/xml as a valid feed content-type", async () => {
    mockFetch(200, { contentType: "text/xml; charset=utf-8" });
    await expect(preflightFeed("https://example.com/feed.xml", 100)).resolves.toBeUndefined();
  });

  it("accepts application/json (JSON feeds)", async () => {
    mockFetch(200, { contentType: "application/json" });
    await expect(preflightFeed("https://example.com/feed.json", 100)).resolves.toBeUndefined();
  });

  it("rejects with http-4xx for 404", async () => {
    mockFetch(404);
    await expect(preflightFeed("https://example.com/missing", 100)).rejects.toMatchObject({
      code: "http-4xx",
      httpStatus: 404,
    });
  });

  it("rejects with http-5xx for 503", async () => {
    mockFetch(503);
    await expect(preflightFeed("https://example.com/down", 100)).rejects.toMatchObject({
      code: "http-5xx",
      httpStatus: 503,
    });
  });

  it("rejects with not-feed for text/html that has no feed-like content", async () => {
    mockFetch(200, { contentType: "text/html", body: "<html><body>not a feed</body></html>" });
    await expect(preflightFeed("https://example.com/page", 100)).rejects.toMatchObject({
      code: "not-feed",
    });
  });

  it("accepts text/html if body contains <rss or <feed (lenient — server misconfig)", async () => {
    mockFetch(200, {
      contentType: "text/html",
      body: "<?xml version=\"1.0\"?><rss><channel><title>x</title></channel></rss>",
    });
    await expect(preflightFeed("https://example.com/feed", 100)).resolves.toBeUndefined();
  });

  it("rejects with timeout when fetch aborts", async () => {
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    await expect(preflightFeed("https://example.com/slow", 20)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("rejects with network for ENOTFOUND-style fetch errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND nope.invalid"), {
        code: "ENOTFOUND",
      });
    }) as unknown as typeof fetch;

    await expect(preflightFeed("https://nope.invalid/feed", 100)).rejects.toMatchObject({
      code: "network",
    });
  });

  it("wraps non-FeedError exceptions as FeedError", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("weird");
    }) as unknown as typeof fetch;

    const result = preflightFeed("https://example.com/x", 100);
    await expect(result).rejects.toBeInstanceOf(FeedError);
  });
});
