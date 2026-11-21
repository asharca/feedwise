import { expect, it, vi } from "vitest";
import { Response } from "undici";
import { extractFullText, readFullText } from "@/lib/articles/fulltext";

const url = "https://example.org/news/one";
const prose =
  "This is a readable paragraph about a new discovery, with words that contribute to the content. ".repeat(
    12,
  );
const page =
  "<html><head><title>The discovery</title></head><body><article><h1>The discovery</h1><p>" +
  prose +
  '</p><p><a href="../more">More</a><img src="photo.jpg" onerror="bad()"></p></article></body></html>';

it("extracts readable markup and resolves links and images without retaining event attributes", () => {
  const html = extractFullText(page, url);
  expect(html).toContain("readable paragraph");
  expect(html).toContain('href="https://example.org/more"');
  expect(html).toContain('src="https://example.org/news/photo.jpg"');
  expect(html).not.toContain("onerror");
});

it("bounds the synchronous request and records oversized, inaccessible and missing pages as failed", async () => {
  const request = vi.fn(async () => new Response(page));
  expect(await readFullText(url, request)).toMatchObject({
    status: "ok",
    html: expect.stringContaining(prose.trim()),
  });
  expect(request).toHaveBeenCalledWith(url, expect.objectContaining({ timeoutMs: 20_000 }));
  expect(
    await readFullText(
      url,
      async () =>
        new Response("body", { headers: { "content-length": String(5 * 1024 * 1024 + 1) } }),
    ),
  ).toEqual({ status: "failed", html: null });
  expect(await readFullText(url, async () => new Response(null, { status: 403 }))).toEqual({
    status: "failed",
    html: null,
  });
  expect(await readFullText(null, request)).toEqual({ status: "failed", html: null });
  expect(request).toHaveBeenCalledTimes(1);
});
