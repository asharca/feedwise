import { NextRequest, NextResponse } from "next/server";
import { pickWidthTier, resizeImage } from "@/lib/images/resize-image";

const BLOCKED_HOSTS =
  process.env.NODE_ENV === "production"
    ? ["localhost", "127.0.0.1", "0.0.0.0", "::1"]
    : ["0.0.0.0", "::1"];

// 1x1 transparent GIF — returned when upstream fails so browsers don't retry
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function placeholderResponse(upstreamStatus: number) {
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=300",
      "X-Proxy-Status": String(upstreamStatus),
    },
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new NextResponse("Unsupported protocol", { status: 400 });
  }

  if (BLOCKED_HOSTS.some((h) => parsed.hostname === h)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Forward a minimal set of client headers.
  // Do NOT send Referer: many CDNs block requests with a foreign Referer.
  const headers: Record<string, string> = {
    "User-Agent":
      req.headers.get("user-agent") ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      req.headers.get("accept") ??
      "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": req.headers.get("accept-language") ?? "en-US,en;q=0.9",
  };

  try {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      return placeholderResponse(res.status);
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return placeholderResponse(415);
    }

    const body = await res.arrayBuffer();

    // Downscale to the requested tier so thumbnails don't ship (and decode)
    // multi-megapixel originals — full-size decoded bitmaps get evicted and
    // re-decoded during scroll on mobile, which flickers visibly.
    const widthTier = pickWidthTier(req.nextUrl.searchParams.get("w"));
    const out = widthTier
      ? await resizeImage(Buffer.from(body), contentType, widthTier)
      : { body: Buffer.from(body), contentType };

    return new NextResponse(new Uint8Array(out.body), {
      headers: {
        "Content-Type": out.contentType,
        // Behave like a real CDN asset: long-lived + immutable, and crucially
        // NO `stale-while-revalidate` — SWR tells the browser to fire a
        // background revalidation request on access, which on iOS WebKit shows
        // up as an image request on every scroll-back and flashes the image.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (_err) {
    return placeholderResponse(502);
  }
}
