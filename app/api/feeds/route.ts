import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { findFeedByUrl, getSubscriptions, subscribeFeed } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";
import { preflightFeed } from "@/lib/feeds/parser";
import { FeedError, classifyError, humanMessage } from "@/lib/feeds/feed-error";

const SUBSCRIBE_PREFLIGHT_TIMEOUT_MS = 5_000;

const SubscribeSchema = z
  .object({
    url: z.string().url().optional(),
    urls: z.array(z.string().url()).optional(),
    folderId: z.string().uuid().optional(),
  })
  .refine((d) => d.url || (d.urls && d.urls.length > 0), {
    message: "Provide url or urls",
  });

interface SubscribeResult {
  url: string;
  feedId?: string;
  error?: string;
  errorCode?: string;
}

export const GET = withAuth(async (_req, session) => {
  const subs = await getSubscriptions(session.user.id);
  return NextResponse.json({ success: true, data: subs });
});

export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const { url, urls, folderId } = SubscribeSchema.parse(body);

  const feedUrls = urls ?? (url ? [url] : []);
  const results: SubscribeResult[] = [];

  for (const feedUrl of feedUrls) {
    try {
      // Skip preflight for feeds we already know are reachable.
      const existing = await findFeedByUrl(feedUrl);
      const alreadyHealthy = existing && existing.lastFetchedAt;

      if (!alreadyHealthy) {
        await preflightFeed(feedUrl, SUBSCRIBE_PREFLIGHT_TIMEOUT_MS);
      }

      const { feedId } = await subscribeFeed(session.user.id, feedUrl, folderId);
      try {
        await getFeedFetchQueue().add(
          "fetch",
          { feedId, url: feedUrl },
          { jobId: `feed-${feedId}-init`, attempts: 3 },
        );
      } catch {
        // Non-fatal: subscription saved, fetch will retry on next scheduler run
      }
      results.push({ url: feedUrl, feedId });
    } catch (err) {
      const fe = err instanceof FeedError ? err : classifyError(err);
      results.push({
        url: feedUrl,
        error: humanMessage(fe.code, fe.httpStatus),
        errorCode: fe.code,
      });
    }
  }

  const succeeded = results.filter((r) => r.feedId);
  const failed = results.filter((r) => r.error);

  // For a single URL submission, surface a 400 on failure so the UI can
  // show the message inline rather than having to dig into results[0].
  if (feedUrls.length === 1 && failed.length === 1) {
    return NextResponse.json(
      {
        success: false,
        error: failed[0].error,
        errorCode: failed[0].errorCode,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      added: succeeded.length,
      failed: failed.length,
      results,
    },
  });
});
