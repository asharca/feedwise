import { expect, it, vi } from "vitest";
import { Headers, Response } from "undici";
import { fetchFeed, preflightFeed } from "@/lib/feeds/fetcher";
import type { SafeFetchOptions } from "@/lib/net/safe-fetch";

const url = "https://example.org/feed";

it("sends both validators, skips a 304 body, retains or replaces validators", async () => {
  const request = vi.fn(async (address: string | URL, options?: SafeFetchOptions) => {
    expect(String(address)).toBe(url);
    const headers = new Headers(options?.headers);
    expect(headers.get("if-none-match")).toBe('"one"');
    expect(headers.get("if-modified-since")).toBe("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(headers.get("user-agent")).toBe("Feedwise/1.0 (+https://github.com/asharca/feedwise)");
    return new Response(null, {
      status: 304,
      headers: { etag: '"two"', "cache-control": 'public, max-age="3600"' },
    });
  });
  const r = await fetchFeed(
    url + "#feedwise-html=abc",
    { etag: '"one"', lastModified: "Wed, 21 Oct 2015 07:28:00 GMT" },
    request,
  );
  expect(r).toMatchObject({
    body: null,
    etag: '"two"',
    lastModified: "Wed, 21 Oct 2015 07:28:00 GMT",
    maxAgeMs: 3600000,
  });
});

it("reads a changed body, discards obsolete validators and rejects oversized bodies", async () => {
  const r = await fetchFeed(
    url,
    { etag: '"old"' },
    async () => new Response("fresh", { headers: { "last-modified": "now" } }),
  );
  expect(r).toMatchObject({ body: "fresh", etag: null, lastModified: "now" });
  await expect(
    fetchFeed(
      url,
      {},
      async () =>
        new Response("x", { headers: { "content-length": String(10 * 1024 * 1024 + 1) } }),
    ),
  ).rejects.toThrow();
});

it.each([429, 503])("classifies %s with Retry-After metadata", async (status) => {
  await expect(
    fetchFeed(
      url,
      {},
      async () => new Response(null, { status, headers: { "retry-after": "7200" } }),
    ),
  ).rejects.toMatchObject({
    httpStatus: status,
    retryAfterMs: 7_200_000,
    code: status === 429 ? "http-4xx" : "http-5xx",
  });
});

it("preflights mislabelled XML without accepting a generic HTML document", async () => {
  await expect(
    preflightFeed(
      url,
      1000,
      async () => new Response("<rss/>", { headers: { "content-type": "text/html" } }),
    ),
  ).resolves.toBeUndefined();
  await expect(preflightFeed(url, 1000, async () => new Response("<html/>"))).rejects.toMatchObject(
    { code: "not-feed" },
  );
  await expect(
    preflightFeed(url, 1000, async () => new Response(null, { status: 404 })),
  ).rejects.toMatchObject({ code: "http-4xx", httpStatus: 404 });
  await expect(
    preflightFeed(url, 1000, async () => {
      throw new DOMException("Time exceeded", "TimeoutError");
    }),
  ).rejects.toMatchObject({ code: "timeout" });
});

it("assigns two slots per host, without blocking independent hosts", async () => {
  const gate = Promise.withResolvers<void>();
  const started: string[] = [];
  const request = async (url: string | URL) => {
    started.push(String(url));
    await gate.promise;
    return new Response("ok");
  };
  const urls = [url + "/1", url + "/2", url + "/3", "https://other.org/feed"];
  const all = Promise.all(urls.map((u) => fetchFeed(u, {}, request)));
  expect(started).toEqual([urls[0], urls[1], urls[3]]);
  gate.resolve();
  await all;
  expect(started[3]).toBe(urls[2]);
});
