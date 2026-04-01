import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { connection } from "@/lib/jobs/queue";
import { db } from "@/lib/db";
import { feeds, articles } from "@/lib/db/schema";
import { parseFeed } from "@/lib/feeds/parser";

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
            }))
          )
          .onConflictDoNothing();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db
          .update(feeds)
          .set({ lastFetchError: message, lastFetchedAt: new Date() })
          .where(eq(feeds.id, feedId));
        throw error;
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[feed-worker] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
