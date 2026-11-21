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
        {
          jobId: `feed-${sub.feedId}-manual-${crypto.randomUUID()}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      enqueued++;
    } catch {
      // skip duplicates or queue errors
    }
  }

  return NextResponse.json({ success: true, data: { synced: enqueued } });
});
