import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { pickWidthTier, resizeImage } from "@/lib/images/resize-image";
import { readLimitedBytes, safeFetch } from "@/lib/net/safe-fetch";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

// 1x1 transparent GIF — returned when upstream fails so browsers don't retry
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// Proxied bytes are attacker-controlled and served from our origin: forbid
// sniffing and script execution (matters for SVG opened as a document).
const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
};

function placeholderResponse() {
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      ...SAFE_HEADERS,
      "Content-Type": "image/gif",
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url", { status: 400 });
  }

  try {
    // Do NOT send Referer: many CDNs block requests with a foreign Referer.
    const res = await safeFetch(url, {
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      headers: {
        "User-Agent":
          req.headers.get("user-agent") ??
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": req.headers.get("accept-language") ?? "en-US,en;q=0.9",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.startsWith("image/")) {
      await res.body?.cancel().catch(() => {});
      return placeholderResponse();
    }

    const body = Buffer.from(await readLimitedBytes(res, MAX_IMAGE_BYTES));

    // Downscale to the requested tier so thumbnails don't ship (and decode)
    // multi-megapixel originals — full-size decoded bitmaps get evicted and
    // re-decoded during scroll on mobile, which flickers visibly.
    const widthTier = pickWidthTier(req.nextUrl.searchParams.get("w"));
    const out = widthTier ? await resizeImage(body, contentType, widthTier) : { body, contentType };

    return new NextResponse(new Uint8Array(out.body), {
      headers: {
        ...SAFE_HEADERS,
        "Content-Type": out.contentType,
        // Long-lived + immutable, and crucially NO `stale-while-revalidate` —
        // SWR makes iOS WebKit re-request on every scroll-back and flash the
        // image. `private`: responses sit behind a session check.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    // Unsafe target, timeout, oversize or network failure: same opaque placeholder,
    // so the endpoint can't be used to probe which internal hosts exist.
    return placeholderResponse();
  }
}
