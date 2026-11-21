import { expect, it } from "vitest";
import { DOMParser } from "linkedom";
import { buildRss } from "@/lib/share/rss";
import { shareSchema, newShareToken, shareDto } from "@/lib/share/feed";

it("round-trips RSS text, links and embedded CDATA terminators without XML injection", () => {
  const name = `新闻 & <friends> \"'`,
    link = "https://example.org/?a=1&b=2";
  const content = "<b>before</b>]]></item><item>after 😸";
  const xml = buildRss(name, link, [
    {
      id: "opaque&id",
      title: "A\u0001B & C",
      summary: "a < b",
      content,
      url: link,
      published: new Date(0),
    },
  ]);
  expect(xml).toContain("&amp; &lt;friends&gt; &quot;&apos;");
  expect(xml).toContain("]]]]><![CDATA[>");
  const document = new DOMParser().parseFromString(xml, "text/xml");
  expect(document.querySelector("channel > title")?.textContent).toBe(name);
  expect(document.querySelectorAll("item")).toHaveLength(1);
  const item = document.querySelector("item")!;
  expect(item.getElementsByTagName("content:encoded")[0].textContent).toBe(content);
  expect(item.querySelector("link")?.textContent).toBe(link);
  expect(item.querySelector("title")?.textContent).toBe("AB & C");
  expect(item.querySelector("guid")?.getAttribute("isPermaLink")).toBe("false");
  expect(item.querySelector("pubDate")?.textContent).toBe("Thu, 01 Jan 1970 00:00:00 GMT");
});

it("refuses misspelled filters rather than publishing an unfiltered feed", () => {
  expect(shareSchema.safeParse({ name: "Feed", filter: { tag: "x" } }).success).toBe(false);
  expect(
    shareSchema.safeParse({ name: "Feed", filter: { starred: false, view: "picture" } }).success,
  ).toBe(true);
});

it("rotates opaque URL-safe tokens and emits only the public management DTO", () => {
  const token = newShareToken();
  expect(token).toMatch(/^[a-zA-Z0-9_-]{43}$/);
  expect(token).not.toBe(newShareToken());
  const dto = shareDto(new Request("https://example.org/api/share-feeds"), {
    token,
    name: "Feed",
    id: "x",
    filter: {},
    createdAt: new Date(0),
  });
  expect(dto.url).toMatch(new RegExp(`/api/public/rss/${token}$`));
  expect(dto).not.toHaveProperty("token");
});
