import { expect, it } from "vitest";
import { parseHtmlSource } from "@/lib/feeds/html-source";
import { htmlSourceUrl } from "@/lib/feeds/source-config";
import { createHash } from "node:crypto";

const url = "https://example.org/news/index.html";
const config = { item: "article", title: "h2", content: "p", date: "time", image: "img" };
const html =
  '<title>Page</title><article><a href="one"><h2> One </h2></a><p>Hello <b>world</b></p><time datetime="2026-06-01"></time><img data-src="/1.png"></article><article><h2>Two</h2></article><article></article>';

it("extracts only titled items, resolves relative URLs and falls back to the title hash", () => {
  const feed = parseHtmlSource(html, url, config);
  expect(feed.title).toBe("Page");
  expect(feed.articles).toHaveLength(2);
  expect(feed.articles[0]).toMatchObject({
    title: "One",
    guid: "https://example.org/news/one",
    url: "https://example.org/news/one",
    summary: "Hello world",
    publishedAt: new Date("2026-06-01"),
    imageUrl: "https://example.org/1.png",
  });
  expect(feed.articles[1].guid).toBe(createHash("sha1").update("Two").digest("hex"));
});

it("separates configurations on one page, independent of object key order", () => {
  const id = htmlSourceUrl(url, config);
  expect(id).toBe(
    url +
      "#feedwise-html=" +
      createHash("sha1").update(JSON.stringify(config)).digest("hex").slice(0, 12),
  );
  expect(
    htmlSourceUrl(url + "#section", {
      title: "h2",
      ...Object.fromEntries(Object.entries(config).reverse()),
      item: "article",
    }),
  ).toBe(id);
  expect(htmlSourceUrl(url, { ...config, title: "h3" })).not.toBe(id);
});

it("rejects invalid selectors or empty matches; preview can bound the results", () => {
  expect(() => parseHtmlSource(html, url, { ...config, item: "[" })).toThrow();
  expect(() => parseHtmlSource(html, url, { ...config, title: "missing" })).toThrow();
  expect(parseHtmlSource(html.repeat(25), url, config, 20).articles).toHaveLength(20);
});
