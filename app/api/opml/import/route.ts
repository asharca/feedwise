import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { subscribeFeed } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const feedUrls = parseOPML(text);

    if (feedUrls.length === 0) {
      return NextResponse.json({ success: false, error: "No feeds found in OPML" }, { status: 400 });
    }

    const results: { url: string; ok: boolean }[] = [];

    for (const url of feedUrls) {
      try {
        const { feedId } = await subscribeFeed(session.user.id, url);
        await getFeedFetchQueue().add("fetch", { feedId, url }, { jobId: `import-${feedId}` });
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
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
}

function parseOPML(xml: string): string[] {
  const urls: string[] = [];
  // Simple regex-based OPML parser for outline elements with xmlUrl
  const outlineRegex = /<outline[^>]*xmlUrl\s*=\s*"([^"]*)"[^>]*\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = outlineRegex.exec(xml)) !== null) {
    const url = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (url) urls.push(url);
  }
  return urls;
}
