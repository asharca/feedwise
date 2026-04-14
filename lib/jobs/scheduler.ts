import { getFeedFetchQueue } from "./queue";
import { db } from "@/lib/db";
import { feeds, subscriptions } from "@/lib/db/schema";
import { sql, lt, or, isNull } from "drizzle-orm";

/** Enqueue fetch jobs for all feeds due for a refresh. Called by cron. */
export async function scheduleFeedRefreshes() {
  const due = await db
    .selectDistinct({ id: feeds.id, url: feeds.url })
    .from(feeds)
    .innerJoin(subscriptions, sql`${subscriptions.feedId} = ${feeds.id}`)
    .where(
      or(
        isNull(feeds.lastFetchedAt),
        lt(
          feeds.lastFetchedAt,
          sql`now() - (${feeds.fetchIntervalMinutes} * interval '1 minute')`
        )
      )
    );

  let enqueued = 0;

  for (const feed of due) {
    await getFeedFetchQueue().add(
      "fetch",
      { feedId: feed.id, url: feed.url },
      {
        // Use a per-run unique ID so periodic refresh jobs are not permanently deduplicated.
        jobId: `feed-${feed.id}-scheduled-${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      }
    );
    enqueued++;
  }

  return enqueued;
}
