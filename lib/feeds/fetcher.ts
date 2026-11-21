import { safeFetch, readLimitedText } from "@/lib/net/safe-fetch";
import { FeedError, classifyError, humanMessage } from "./feed-error";

const hosts = new Map<string, { active: number; waiting: (() => void)[] }>();
const USER_AGENT = "Feedwise/1.0 (+https://github.com/asharca/feedwise)";

async function withHostSlot<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const state = hosts.get(host) ?? { active: 0, waiting: [] };
  hosts.set(host, state);
  if (state.active >= 2) {
    const { promise, resolve } = Promise.withResolvers<void>();
    state.waiting.push(resolve);
    await promise;
  } else state.active++;
  try {
    return await fn();
  } finally {
    // Transfer the occupied slot directly to the oldest waiter.
    const next = state.waiting.shift();
    if (next) next();
    else if (--state.active === 0) hosts.delete(host);
  }
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

interface Options {
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
  html?: boolean;
}

export interface FetchResult {
  url: string;
  body: string | null; // null only on 304
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  maxAgeMs: number;
}

export async function fetchFeed(
  input: string,
  opts: Options = {},
  request = safeFetch,
): Promise<FetchResult> {
  try {
    const url = new URL(input);
    url.hash = "";
    return await withHostSlot(url.hostname, async () => {
      const headers: Record<string, string> = {
        "user-agent": USER_AGENT,
        accept: opts.html
          ? "text/html,*/*;q=0.5"
          : "application/rss+xml,application/atom+xml,application/feed+json,application/xml,text/xml,application/json,*/*;q=0.5",
      };
      if (opts.etag) headers["if-none-match"] = opts.etag;
      if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;
      const res = await request(url, { headers, timeoutMs: opts.timeoutMs });
      const unchanged = res.status === 304;
      if (!res.ok && !unchanged) {
        await res.body?.cancel();
        const code = res.status >= 500 ? "http-5xx" : "http-4xx";
        throw new FeedError(code, humanMessage(code, res.status), {
          httpStatus: res.status,
          retryAfterMs: [429, 503].includes(res.status)
            ? retryAfter(res.headers.get("retry-after"))
            : undefined,
        });
      }
      const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)"?(?:\s*,|$)/i.exec(
        res.headers.get("cache-control") ?? "",
      );
      return {
        url: res.url || url.href,
        body: unchanged ? null : await readLimitedText(res, 10 * 1024 * 1024),
        contentType: res.headers.get("content-type") ?? "",
        etag: res.headers.get("etag") ?? (unchanged ? (opts.etag ?? null) : null),
        lastModified:
          res.headers.get("last-modified") ?? (unchanged ? (opts.lastModified ?? null) : null),
        maxAgeMs: Number(maxAge?.[1] ?? 0) * 1000,
      };
    });
  } catch (err) {
    throw classifyError(err);
  }
}

export async function preflightFeed(
  url: string,
  timeoutMs: number,
  request = safeFetch,
): Promise<void> {
  const { body, contentType } = await fetchFeed(url, { timeoutMs }, request);
  if (
    /xml|rss|atom|json/i.test(contentType) ||
    /<rss|<feed|<\?xml|<rdf:rdf/i.test(body?.slice(0, 4096) ?? "")
  )
    return;
  throw new FeedError("not-feed", humanMessage("not-feed"));
}
