import { parseFeed as parseDocument, type AtomFeed, type RdfFeed, type RssFeed } from "feedsmith";
import { FeedError, humanMessage } from "./feed-error";
import { absoluteUrl, parsedItem, type ParsedArticle } from "./item";
import { parseMedia } from "./media";

export interface ParsedFeed {
  feedType: "rss" | "atom" | "json" | null;
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  iconUrl: string | null;
  articles: ParsedArticle[];
}
export type { ParsedArticle } from "./item";

function alternate(links?: AtomFeed.Link<string>[]) {
  return links?.find((l) => !l.rel || l.rel === "alternate")?.href;
}

function rssItem(i: RssFeed.Item<string> & RdfFeed.Item<string>, base?: string) {
  return parsedItem(
    {
      guid: i.guid?.value ?? i.rdf?.about,
      url: i.link,
      title: i.title,
      author:
        i.authors?.[0]?.name ?? i.dc?.creators?.[0] ?? i.itunes?.author ?? i.authors?.[0]?.email,
      html: i.content?.encoded ?? i.description,
      summary: i.description ?? i.itunes?.summary,
      date: i.pubDate ?? i.dc?.dates?.[0],
      media: parseMedia(base, i.enclosures, i.media, i.itunes),
    },
    base,
  );
}

/** Pure parse: no network or database access. RDF is the RSS 1.0 serialization. */
export function parseFeed(body: string, base?: string): ParsedFeed {
  try {
    const { format, feed } = parseDocument(body);
    if (format === "atom")
      return {
        feedType: format,
        title: feed.title?.value ?? null,
        description: feed.subtitle?.value ?? null,
        siteUrl: absoluteUrl(alternate(feed.links), base),
        iconUrl: absoluteUrl(feed.icon ?? feed.logo, base),
        articles: (feed.entries ?? []).map((i) =>
          parsedItem(
            {
              guid: i.id,
              title: i.title?.value,
              url: alternate(i.links),
              author: i.authors?.[0]?.name ?? feed.authors?.[0]?.name,
              date: i.published ?? i.updated,
              html: i.content?.value ?? i.summary?.value,
              summary: i.summary?.value,
              media: parseMedia(
                base,
                i.links
                  ?.filter((l) => l.rel === "enclosure")
                  .map((l) => ({ url: l.href, type: l.type })),
                i.media,
                i.itunes,
              ),
            },
            base,
          ),
        ),
      };
    if (format === "json")
      return {
        feedType: format,
        title: feed.title ?? null,
        description: feed.description ?? null,
        siteUrl: absoluteUrl(feed.home_page_url, base),
        iconUrl: absoluteUrl(feed.favicon ?? feed.icon, base),
        articles: (feed.items ?? []).map((i) =>
          parsedItem(
            {
              guid: i.id,
              url: i.url ?? i.external_url,
              title: i.title,
              author: i.authors?.[0]?.name ?? feed.authors?.[0]?.name,
              date: i.date_published ?? i.date_modified,
              html: i.content_html,
              text: i.content_text,
              summary: i.summary,
              media: parseMedia(base, [
                ...(i.attachments ?? []).map((a) => ({
                  url: a.url,
                  type: a.mime_type,
                  duration: a.duration_in_seconds,
                })),
                { url: i.image ?? i.banner_image, medium: "image" },
              ]),
            },
            base,
          ),
        ),
      };
    return {
      feedType: "rss",
      title: feed.title ?? null,
      description: feed.description ?? null,
      siteUrl: absoluteUrl(feed.link, base),
      iconUrl: absoluteUrl(
        feed.image?.url ?? (format === "rss" ? feed.itunes?.image : undefined),
        base,
      ),
      articles: (feed.items ?? []).map((i) => rssItem(i, base)),
    };
  } catch (cause) {
    throw new FeedError("parse", humanMessage("parse"), { cause });
  }
}
