export interface RssArticle {
  id: string;
  title: string;
  url: string | null;
  summary: string | null;
  content: string | null;
  published: Date;
}

// Only XML 1.0 Char values; feeds can contain C0 controls or lone surrogates.
const clean = (value: string) =>
  value.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, "");
const escapeXml = (value: string) =>
  clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const cdata = (value: string) => `<![CDATA[${clean(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

export function buildRss(name: string, link: string, articles: RssArticle[]) {
  const title = escapeXml(name);
  const items = articles.map((a) =>
    [
      "<item>",
      `<title>${escapeXml(a.title)}</title>`,
      a.url && `<link>${escapeXml(a.url)}</link>`,
      `<guid isPermaLink="false">${escapeXml(a.id)}</guid>`,
      `<pubDate>${a.published.toUTCString()}</pubDate>`,
      `<description>${escapeXml(a.summary ?? a.content ?? "")}</description>`,
      a.content && `<content:encoded>${cdata(a.content)}</content:encoded>`,
      "</item>",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "<channel>",
    `<title>${title}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<description>${title}</description>`,
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
}
