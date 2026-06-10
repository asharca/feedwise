import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getSubscriptions } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";

export const POST = withAuth(async (_req, session) => {
  const subs = await getSubscriptions(session.user.id);

  let enqueued = 0;
  for (const sub of subs) {
    try {
      await getFeedFetchQueue().add(
        "fetch",
        { feedId: sub.feedId, url: sub.url },
        { jobId: `feed-${sub.feedId}-manual-${Date.now()}`, attempts: 3 },
      );
      enqueued++;
    } catch {
      // skip duplicates or queue errors
    }
  }

  return NextResponse.json({ success: true, data: { synced: enqueued } });
});
