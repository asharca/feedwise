// eslint-disable-next-line @typescript-eslint/no-require-imports
const FeedParser = require("feedparser-promised") as {
  parse: (url: string) => Promise<Record<string, unknown>[]>;
};

export interface ParsedArticle {
  guid: string;
  url: string | null;
  title: string | null;
  author: string | null;
  contentHtml: string | null;
  contentText: string | null;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
}

export interface ParsedFeed {
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  iconUrl: string | null;
  articles: ParsedArticle[];
}

export async function parseFeed(url: string): Promise<ParsedFeed> {
  const items = await FeedParser.parse(url);

  const meta = (items[0]?.["meta"] as Record<string, unknown>) ?? {};

  const articles: ParsedArticle[] = items.map((i) => {
    return {
      guid: String(i["guid"] ?? i["link"] ?? i["title"] ?? Math.random()),
      url: (i["link"] as string) ?? null,
      title: (i["title"] as string) ?? null,
      author: (i["author"] as string) ?? null,
      contentHtml: (i["description"] as string) ?? null,
      contentText: stripHtml((i["description"] as string) ?? ""),
      summary: (i["summary"] as string) ?? null,
      imageUrl: getImageUrl(i),
      publishedAt: i["pubdate"] ? new Date(i["pubdate"] as string) : null,
    };
  });

  return {
    title: (meta["title"] as string) ?? null,
    description: (meta["description"] as string) ?? null,
    siteUrl: (meta["link"] as string) ?? null,
    iconUrl: (meta["favicon"] as string) ?? null,
    articles,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getImageUrl(item: Record<string, unknown>): string | null {
  const enclosures = item["enclosures"] as Array<{
    url: string;
    type: string;
  }> | undefined;
  const imageEnclosure = enclosures?.find((e) => e.type?.startsWith("image/"));
  if (imageEnclosure) return imageEnclosure.url;

  const img = (item["image"] as { url?: string } | undefined)?.url;
  return img ?? null;
}
