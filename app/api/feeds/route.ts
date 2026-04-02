import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getSubscriptions, subscribeFeed } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";

const SubscribeSchema = z.object({
  url: z.string().url().optional(),
  urls: z.array(z.string().url()).optional(),
  folderId: z.string().uuid().optional(),
}).refine((d) => d.url || (d.urls && d.urls.length > 0), {
  message: "Provide url or urls",
});

export async function GET() {
  try {
    const session = await requireSession();
    const subs = await getSubscriptions(session.user.id);
    return NextResponse.json({ success: true, data: subs });
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { url, urls, folderId } = SubscribeSchema.parse(body);

    const feedUrls = urls ?? (url ? [url] : []);
    const results: { url: string; feedId?: string; error?: string }[] = [];

    for (const feedUrl of feedUrls) {
      try {
        const { feedId } = await subscribeFeed(session.user.id, feedUrl, folderId);
        try {
          await getFeedFetchQueue().add(
            "fetch",
            { feedId, url: feedUrl },
            { jobId: `feed-${feedId}-init`, attempts: 3 }
          );
        } catch {
          // Non-fatal: subscription saved, fetch will retry on next scheduler run
        }
        results.push({ url: feedUrl, feedId });
      } catch (err) {
        results.push({
          url: feedUrl,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    const succeeded = results.filter((r) => r.feedId);
    const failed = results.filter((r) => r.error);

    return NextResponse.json({
      success: true,
      data: {
        added: succeeded.length,
        failed: failed.length,
        results,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to subscribe";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
