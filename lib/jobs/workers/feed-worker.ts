import { Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { getConnection } from "@/lib/jobs/queue";
import { db } from "@/lib/db";
import { feeds, articles } from "@/lib/db/schema";
import { parseFeed } from "@/lib/feeds/parser";
import { classifyError, humanMessage } from "@/lib/feeds/feed-error";

export function startFeedWorker() {
  const worker = new Worker(
    "feed.fetch",
    async (job) => {
      const { feedId, url } = job.data as { feedId: string; url: string };

      try {
        const parsed = await parseFeed(url);

        await db
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

        if (parsed.articles.length === 0) return;

        await db
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
              imageUrl: a.imageUrl ?? undefined,
              publishedAt: a.publishedAt ?? undefined,
            })),
          )
          .onConflictDoNothing();
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

        // Re-throw so BullMQ records the failure / retries per job options
        throw feedError;
      }
    },
    { connection: getConnection(), concurrency: 5 },
  );

  worker.on("completed", (job) => {
    console.log(`[feed-worker] ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[feed-worker] ${job?.id} failed:`, err.message);
  });

  return worker;
}
