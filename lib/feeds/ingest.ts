import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds, articles } from "@/lib/db/schema";
import { parseFeed } from "@/lib/feeds/parser";
import { classifyError, humanMessage } from "@/lib/feeds/feed-error";
import { publishEvent } from "@/lib/events/publisher";
import { getSubscriberUserIds } from "@/lib/db/queries/feeds";

export interface IngestDeps {
  parse: typeof parseFeed;
  publish: typeof publishEvent;
  getSubscribers: typeof getSubscriberUserIds;
}

const defaultDeps: IngestDeps = {
  parse: parseFeed,
  publish: publishEvent,
  getSubscribers: getSubscriberUserIds,
};

function extractFirstImageUrl(html: string | null | undefined): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]+src=["'](https?:\/\/[^"'\s>]+)["']/i);
  return match?.[1];
}

/**
 * Fetch + parse a feed and store its articles. Feed metadata update and
 * article upsert happen in ONE transaction; subscriber events are published
 * after commit (best-effort — publishEvent swallows Redis errors).
 *
 * On failure: records the classified error on the feed row, notifies
 * subscribers, and rethrows the FeedError so BullMQ can retry per job options.
 */
export async function ingestFeed(
  feedId: string,
  url: string,
  deps: IngestDeps = defaultDeps,
): Promise<{ articleCount: number }> {
  try {
    const parsed = await deps.parse(url);

    const inserted = await db.transaction(async (tx) => {
      await tx
        .update(feeds)
        .set({
          title: parsed.title ?? undefined,
          description: parsed.description ?? undefined,
          siteUrl: parsed.siteUrl ?? undefined,
          iconUrl: parsed.iconUrl ?? undefined,
          lastFetchedAt: new Date(),
          lastFetchError: null,
          errorCode: null,
          consecutiveFailures: 0,
        })
        .where(eq(feeds.id, feedId));

      if (parsed.articles.length === 0) return [];

      return tx
        .insert(articles)
        .values(
          parsed.articles.map((a) => ({
            feedId,
            guid: a.guid,
            url: a.url ?? undefined,
            title: a.title ?? undefined,
            author: a.author ?? undefined,
            contentHtml: a.contentHtml ?? undefined,
            contentText: a.contentText ?? undefined,
            summary: a.summary ?? undefined,
            imageUrl: a.imageUrl ?? extractFirstImageUrl(a.contentHtml) ?? undefined,
            publishedAt: a.publishedAt ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [articles.feedId, articles.guid],
          set: {
            url: sql`excluded.url`,
            title: sql`excluded.title`,
            author: sql`excluded.author`,
            contentHtml: sql`excluded.content_html`,
            contentText: sql`excluded.content_text`,
            summary: sql`excluded.summary`,
            imageUrl: sql`excluded.image_url`,
            publishedAt: sql`excluded.published_at`,
          },
        })
        .returning({ id: articles.id });
    });

    const subscriberIds = await deps.getSubscribers(feedId).catch(() => []);
    if (inserted.length === 0) {
      await Promise.all(
        subscriberIds.map((uid) => deps.publish(uid, { type: "feed.fetched", feedId })),
      );
      return { articleCount: 0 };
    }

    await Promise.all(
      subscriberIds.map((uid) =>
        deps.publish(uid, { type: "articles.new", feedId, count: inserted.length }),
      ),
    );
    return { articleCount: inserted.length };
  } catch (rawError) {
    const feedError = classifyError(rawError);
    const message = humanMessage(feedError.code, feedError.httpStatus);

    await db
      .update(feeds)
      .set({
        lastFetchError: message,
        errorCode: feedError.code,
        lastFetchedAt: new Date(),
        consecutiveFailures: sql`${feeds.consecutiveFailures} + 1`,
      })
      .where(eq(feeds.id, feedId));

    const subscriberIds = await deps.getSubscribers(feedId).catch(() => []);
    await Promise.all(
      subscriberIds.map((uid) =>
        deps.publish(uid, { type: "feed.error", feedId, errorCode: feedError.code, message }),
      ),
    );

    throw feedError;
  }
}
