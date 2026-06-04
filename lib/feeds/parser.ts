import { FeedError, classifyError, humanMessage } from "./feed-error";

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

const DEFAULT_PARSE_TIMEOUT_MS = 15_000;

/**
 * Race a promise against a timer. On timer win, reject with FeedError(timeout).
 * On inner rejection, normalise the error through classifyError so callers
 * always see a FeedError.
 *
 * Note: this does not actually abort the underlying work (feedparser-promised
 * does not expose a cancellation signal). The worker slot will be freed
 * immediately but the dangling request may still consume some sockets briefly.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new FeedError("timeout", humanMessage("timeout")));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(classifyError(err));
      },
    );
  });
}

/**
 * Cheap HTTP-level validation used at subscribe time: we want to tell the user
 * "this isn't a real feed" before we save anything to the database. Issues a
 * single GET (we need bytes to detect mis-served HTML pages) with a short
 * timeout and inspects status + content-type.
 *
 * Throws FeedError on failure; returns void on success.
 */
export async function preflightFeed(url: string, timeoutMs: number): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: {
        // Some feed servers gate on UA / Accept
        "user-agent": "feedwise/1.0 (+https://feedwise.app)",
        accept:
          "application/rss+xml, application/atom+xml, application/xml, application/feed+json, application/json;q=0.9, text/xml;q=0.8, */*;q=0.5",
      },
    });
  } catch (err) {
    throw classifyError(err);
  }

  if (response.status >= 500) {
    throw new FeedError("http-5xx", humanMessage("http-5xx", response.status), {
      httpStatus: response.status,
    });
  }
  if (response.status >= 400) {
    throw new FeedError("http-4xx", humanMessage("http-4xx", response.status), {
      httpStatus: response.status,
    });
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const looksLikeFeedContentType =
    contentType.includes("xml") ||
    contentType.includes("rss") ||
    contentType.includes("atom") ||
    contentType.includes("json");

  if (looksLikeFeedContentType) {
    return;
  }

  // Some servers mis-serve feeds as text/html; sniff the first chunk to be lenient.
  const sample = (await response.text()).slice(0, 4096).toLowerCase();
  if (sample.includes("<rss") || sample.includes("<feed") || sample.includes("<?xml")) {
    return;
  }

  throw new FeedError("not-feed", humanMessage("not-feed"));
}

export async function parseFeed(
  url: string,
  timeoutMs: number = DEFAULT_PARSE_TIMEOUT_MS,
): Promise<ParsedFeed> {
  const items = await withTimeout(FeedParser.parse(url), timeoutMs);

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
      publishedAt: parsePublishedAt(i["pubdate"]),
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
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getImageUrl(item: Record<string, unknown>): string | null {
  const enclosures = item["enclosures"] as
    | Array<{
        url: string;
        type: string;
      }>
    | undefined;
  const imageEnclosure = enclosures?.find((e) => e.type?.startsWith("image/"));
  if (imageEnclosure) return imageEnclosure.url;

  const img = (item["image"] as { url?: string } | undefined)?.url;
  return img ?? null;
}

function parsePublishedAt(input: unknown): Date | null {
  if (!input) return null;

  const date = input instanceof Date ? input : new Date(String(input));
  return Number.isNaN(date.getTime()) ? null : date;
}
