import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { unsubscribeFeed, updateSubscription, updateFeedUrl, updateFeedInterval } from "@/lib/db/queries/feeds";
import { feedFetchQueue } from "@/lib/jobs/queue";

const PatchSchema = z.object({
  customTitle: z.string().max(500).optional(),
  folderId: z.string().uuid().nullable().optional(),
  feedUrl: z.string().url().optional(),
  fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
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
        await feedFetchQueue.add(
          "fetch",
          { feedId: feed.feedId, url: data.feedUrl },
          { jobId: `feed-${feed.feedId}-url-update-${Date.now()}`, attempts: 3 }
        );
      } catch (queueErr) {
        console.error("[feeds] Failed to enqueue fetch job after URL update:", queueErr);
      }
      return NextResponse.json({ success: true, data: feed });
    }

    const { feedUrl: _feedUrl, ...subscriptionData } = data;
    const updated = await updateSubscription(session.user.id, id, subscriptionData);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await unsubscribeFeed(session.user.id, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}
