import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getFeedFetchQueue } from "./queue";

async function claimDueFeeds() {
  // The short lease also recovers a claim if this process dies before enqueue.
  const { rows } = await db.execute<{ id: string; url: string }>(sql`
    with due as materialized (
      select f.id from feeds f
      where (f.next_fetch_at is null or f.next_fetch_at <= now())
        and exists (select 1 from subscriptions s where s.feed_id = f.id)
      order by f.next_fetch_at nulls first, f.id
      limit 200 for update skip locked
    )
    update feeds set next_fetch_at = now() + interval '10 minutes'
    where id in (select id from due) returning id, url
  `);
  return rows;
}

async function enqueue(feed: { id: string; url: string }) {
  await getFeedFetchQueue().add(
    "fetch",
    { feedId: feed.id, url: feed.url },
    {
      jobId: "feed-" + feed.id,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

export async function scheduleFeedRefreshes(claim = claimDueFeeds, add = enqueue) {
  const due = await claim();
  await Promise.all(due.map(add));
  return due.length;
}
