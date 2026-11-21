import { parseHTML } from "linkedom";
import type { HtmlSourceConfig } from "@/lib/db/schema-types";
import { absoluteUrl, sha1 } from "./item";
import { fetchFeed } from "./fetcher";
import { FeedError } from "./feed-error";
import type { ParsedFeed, ParsedArticle } from "./parser";

export function parseHtmlSource(
  body: string,
  pageUrl: string,
  config: HtmlSourceConfig,
  limit = Infinity,
): ParsedFeed {
  const { document } = parseHTML(body);
  const articles: ParsedArticle[] = [];
  try {
    for (const item of document.querySelectorAll(config.item)) {
      const field = (s: string | undefined) =>
        s ? (s === ":scope" ? item : item.querySelector(s)) : null;
      const titleEl = field(config.title);
      const title = titleEl?.textContent?.trim();
      if (!title) continue;
      const link = config.link ? field(config.link) : titleEl;
      const url = absoluteUrl(
        link?.getAttribute("href") ?? link?.closest("a")?.getAttribute("href"),
        pageUrl,
      );
      const summary = field(config.content)?.textContent?.trim() || null;
      const dateEl = field(config.date);
      const date = Date.parse(dateEl?.getAttribute("datetime") ?? dateEl?.textContent ?? "");
      const image = field(config.image);
      const imageUrl = absoluteUrl(
        image?.getAttribute("src") || image?.getAttribute("data-src"),
        pageUrl,
      );
      articles.push({
        guid: url ?? sha1(title),
        title,
        url,
        author: null,
        summary,
        contentHtml: null,
        contentText: summary,
        publishedAt: Number.isFinite(date) ? new Date(date) : null,
        imageUrl,
        media: imageUrl ? [{ type: "image", url: imageUrl }] : [],
      });
      if (articles.length >= limit) break;
    }
  } catch (cause) {
    throw new FeedError("parse", "CSS 选择器无效", { cause });
  }
  if (!articles.length) throw new FeedError("parse", "没有匹配到包含标题的条目");
  return {
    title: document.querySelector("title")?.textContent?.trim() || null,
    siteUrl: pageUrl,
    feedType: null,
    description: null,
    iconUrl: null,
    articles,
  };
}

export async function previewHtmlSource(url: string, config: HtmlSourceConfig, timeoutMs = 15_000) {
  const page = await fetchFeed(url, { html: true, timeoutMs });
  return parseHtmlSource(page.body ?? "", page.url, config, 20);
}
