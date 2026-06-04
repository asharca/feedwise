import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getFeedFromSubscription } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: subscriptionId } = await params;

  const feed = await getFeedFromSubscription(session.user.id, subscriptionId);
  if (!feed) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    await getFeedFetchQueue().add(
      "fetch",
      { feedId: feed.feedId, url: feed.url },
      {
        jobId: `feed-${feed.feedId}-manual-${Date.now()}`,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 200,
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
}
