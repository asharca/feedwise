import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import {
  unsubscribeFeed,
  updateSubscription,
  updateFeedUrl,
  updateFeedInterval,
  getFeedFromSubscription,
} from "@/lib/db/queries/feeds";
import { publishEvent } from "@/lib/events/publisher";
import { getFeedFetchQueue } from "@/lib/jobs/queue";

const PatchSchema = z.object({
  customTitle: z.string().max(500).optional(),
  folderId: z.string().uuid().nullable().optional(),
  feedUrl: z.string().url().optional(),
  fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

export const PATCH = withAuth(async (req, session, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const data = PatchSchema.parse(body);

  if (data.fetchIntervalMinutes !== undefined) {
    const result = await updateFeedInterval(session.user.id, id, data.fetchIntervalMinutes);
    if (!result) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result });
  }

  if (data.feedUrl !== undefined) {
    const feed = await updateFeedUrl(session.user.id, id, data.feedUrl);
    if (!feed) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    try {
      await getFeedFetchQueue().add(
        "fetch",
        { feedId: feed.feedId, url: data.feedUrl },
        { jobId: `feed-${feed.feedId}-url-update-${Date.now()}`, attempts: 3 },
      );
    } catch (queueErr) {
      console.error("[feeds] Failed to enqueue fetch job after URL update:", queueErr);
    }
    return NextResponse.json({ success: true, data: feed });
  }

  const { feedUrl: _feedUrl, ...subscriptionData } = data;
  const updated = await updateSubscription(session.user.id, id, subscriptionData);
  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = withAuth(async (_req, session, ctx) => {
  const { id } = await ctx.params;

  // Look up feedId before deleting so we can include it in the event.
  const feed = await getFeedFromSubscription(session.user.id, id);

  await unsubscribeFeed(session.user.id, id);

  if (feed) {
    await publishEvent(session.user.id, {
      type: "feed.deleted",
      subscriptionId: id,
      feedId: feed.feedId,
    });
  }

  return NextResponse.json({ success: true });
});
