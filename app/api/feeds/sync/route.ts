import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getSubscriptions } from "@/lib/db/queries/feeds";
import { feedFetchQueue } from "@/lib/jobs/queue";

export async function POST() {
  try {
    const session = await requireSession();
    const subs = await getSubscriptions(session.user.id);

    let enqueued = 0;
    for (const sub of subs) {
      try {
        await feedFetchQueue.add(
          "fetch",
          { feedId: sub.feedId, url: sub.url },
          { jobId: `feed-${sub.feedId}-manual-${Date.now()}`, attempts: 3 }
        );
        enqueued++;
      } catch {
        // skip duplicates or queue errors
      }
    }

    return NextResponse.json({ success: true, data: { synced: enqueued } });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
