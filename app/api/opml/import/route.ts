import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { subscribeFeed } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";
import { DOMParser } from "linkedom";
import { htmlConfigSchema, htmlSourceUrl } from "@/lib/feeds/source-config";

export const POST = withAuth(async (req, session) => {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const outlines = Array.from<Element>(doc.querySelectorAll("outline[xmlUrl]"));

  if (outlines.length === 0) {
    return NextResponse.json({ success: false, error: "No feeds found in OPML" }, { status: 400 });
  }

  const results: { url: string; ok: boolean }[] = [];

  for (const outline of outlines) {
    const url = outline.getAttribute("xmlUrl")!;
    try {
      const encoded = outline.getAttribute("feedwise-html");
      const config = encoded ? htmlConfigSchema.parse(JSON.parse(encoded)) : undefined;
      const key = config ? htmlSourceUrl(url, config) : url;
      const { feedId } = await subscribeFeed(session.user.id, key, undefined, config);
      await getFeedFetchQueue().add(
        "fetch",
        { feedId, url: key },
        {
          jobId: `feed-${feedId}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      results.push({ url, ok: true });
    } catch {
      results.push({ url, ok: false });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      imported: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      total: results.length,
    },
  });
});
