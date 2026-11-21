import { and, between, desc, eq, gte, sql } from "drizzle-orm";
import { db, type DB } from "@/lib/db";
import { feeds, articles } from "@/lib/db/schema";
import { simhash } from "@/lib/dedupe/simhash";
import { detectView } from "./detect-view";
import { adaptiveInterval, nextFetchAt } from "./interval";
import { humanMessage, type FeedError } from "./feed-error";
import type { FetchResult } from "./fetcher";
import type { ParsedFeed, ParsedArticle } from "./parser";

type Transaction = Parameters<Parameters<DB["transaction"]>[0]>[0];

export async function loadFeed(id: string) {
  const [feed] = await db
    .select({
      url: feeds.url,
      etag: feeds.etag,
      lastModified: feeds.lastModified,
      sourceType: feeds.sourceType,
      sourceConfig: feeds.sourceConfig,
    })
    .from(feeds)
    .where(eq(feeds.id, id));
  return feed;
}

async function feedInterval(tx: Transaction, feedId: string, failures = 0) {
  const sample = await tx
    .select({ publishedAt: articles.publishedAt })
    .from(articles)
    .where(
      and(
        eq(articles.feedId, feedId),
        between(articles.publishedAt, sql`now() - interval '30 days'`, sql`now()`),
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(30);
  // BETWEEN excludes NULL as well as stale and future dates.
  if (sample.length >= 2)
    return adaptiveInterval(
      sample.map((row) => row.publishedAt!),
      0,
      failures,
    );

  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(articles)
    .where(
      and(eq(articles.feedId, feedId), gte(articles.createdAt, sql`now() - interval '7 days'`)),
    );
  return adaptiveInterval([], row.count, failures);
}

const fields = [
  "url",
  "title",
  "author",
  "contentHtml",
  "contentText",
  "summary",
  "imageUrl",
  "media",
  "publishedAt",
  "simhash",
] as const;
const excluded = (key: (typeof fields)[number]) =>
  sql`excluded.${sql.identifier(articles[key].name)}`;
const changed = sql`(${sql.join(
  fields.map((k) => articles[k]),
  sql`, `,
)}) is distinct from (${sql.join(fields.map(excluded), sql`, `)})`;
const set = Object.fromEntries(fields.map((k) => [k, excluded(k)]));

async function upsertItems(tx: Transaction, feedId: string, items: ParsedArticle[]) {
  // A single INSERT must not contain the same conflict key twice.
  const unique = [...new Map(items.map((item) => [item.guid, item])).values()];
  const inserted: string[] = [];
  for (let i = 0; i < unique.length; i += 500) {
    const rows = await tx
      .insert(articles)
      .values(
        unique.slice(i, i + 500).map((item) => ({
          ...item,
          feedId,
          author: item.author?.slice(0, 255),
          simhash: simhash(item.title, item.contentText ?? item.summary),
        })),
      )
      .onConflictDoUpdate({ target: [articles.feedId, articles.guid], set, setWhere: changed })
      .returning({ id: articles.id, inserted: sql<boolean>`(xmax = 0)` });
    for (const r of rows) if (r.inserted) inserted.push(r.id);
  }
  return inserted;
}

export function saveFetch(
  feedId: string,
  url: string,
  response: FetchResult,
  parsed: ParsedFeed | null,
) {
  return db.transaction(async (tx) => {
    const [feed] = await tx
      .select({ id: feeds.id })
      .from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.url, url)))
      .for("update");
    if (!feed) return []; // Feed removed or URL changed during the request.
    const inserted = parsed ? await upsertItems(tx, feedId, parsed.articles) : [];
    const interval = await feedInterval(tx, feedId);
    const now = new Date();
    await tx
      .update(feeds)
      .set({
        ...(parsed && {
          feedType: parsed.feedType,
          title: parsed.title?.slice(0, 500),
          description: parsed.description,
          siteUrl: parsed.siteUrl,
          iconUrl: parsed.iconUrl,
          defaultView: detectView(parsed.articles),
        }),
        lastFetchedAt: now,
        consecutiveFailures: 0,
        errorCode: null,
        lastFetchError: null,
        // Do not truncate opaque validators: a partial validator is invalid.
        etag: response.etag && response.etag.length <= 255 ? response.etag : null,
        lastModified:
          response.lastModified && response.lastModified.length <= 255
            ? response.lastModified
            : null,
        fetchIntervalMinutes: interval,
        nextFetchAt: nextFetchAt(now, interval, response.maxAgeMs),
      })
      .where(eq(feeds.id, feedId));
    return inserted;
  });
}

export function saveFailure(feedId: string, url: string, error: FeedError) {
  return db.transaction(async (tx) => {
    const [feed] = await tx
      .select({ failures: feeds.consecutiveFailures })
      .from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.url, url)))
      .for("update");
    if (!feed) return;
    const failures = feed.failures + 1;
    const interval = await feedInterval(tx, feedId, failures);
    const now = new Date();
    await tx
      .update(feeds)
      .set({
        lastFetchedAt: now,
        lastFetchError: humanMessage(error.code, error.httpStatus),
        errorCode: error.code,
        consecutiveFailures: failures,
        fetchIntervalMinutes: interval,
        nextFetchAt: nextFetchAt(now, interval, error.retryAfterMs),
      })
      .where(eq(feeds.id, feedId));
  });
}
