declare module "feedparser-promised" {
  interface FeedItem {
    title?: string;
    link?: string;
    guid?: string;
    author?: string;
    description?: string;
    summary?: string;
    pubdate?: string | Date;
    image?: { url?: string };
    enclosures?: Array<{ url: string; type: string; length?: number }>;
    meta?: Record<string, unknown>;
    [key: string]: unknown;
  }

  function parse(url: string): Promise<FeedItem[]>;
  export = { parse };
}
