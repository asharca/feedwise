import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getFeedFromSubscription } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";

export const POST = withAuth(async (_req, session, ctx) => {
  const { id: subscriptionId } = await ctx.params;

  const feed = await getFeedFromSubscription(session.user.id, subscriptionId);
  if (!feed) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    await getFeedFetchQueue().add(
      "fetch",
      { feedId: feed.feedId, url: feed.url },
      {
        jobId: `feed-${feed.feedId}-manual-${crypto.randomUUID()}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  } catch (queueErr) {
    console.error("[feeds/refresh] Failed to enqueue manual fetch:", queueErr);
    return NextResponse.json(
      { success: false, error: "Queue unavailable, please try again" },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true, data: { feedId: feed.feedId } });
});
