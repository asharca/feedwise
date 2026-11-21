"use client";

import { useState } from "react";
import { proxyImg } from "@/lib/utils";

export function FeedIcon({
  url,
  siteUrl,
  feedUrl,
  name,
}: {
  url: string | null;
  siteUrl?: string | null;
  feedUrl: string;
  name: string;
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  let origin: string | undefined;
  for (const candidate of [siteUrl, feedUrl]) {
    if (!candidate) continue;
    try {
      const site = new URL(candidate);
      if (!/^https?:$/.test(site.protocol)) continue;
      origin = site.origin;
      break;
    } catch {
      // A malformed site URL can still fall back to the feed's origin.
    }
  }

  const candidates: string[] = [];
  if (url) {
    try {
      const icon = new URL(url, origin);
      if (/^https?:$/.test(icon.protocol)) candidates.push(icon.href);
    } catch {
      // Invalid metadata must not prevent the site favicon fallback.
    }
  }
  if (origin) candidates.push(`${origin}/favicon.ico`);
  const iconUrl = candidates.find((candidate) => !failedUrls.includes(candidate));
  const markFailed = (failedUrl: string) =>
    setFailedUrls((failed) => (failed.includes(failedUrl) ? failed : [...failed, failedUrl]));

  if (!iconUrl) {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground"
      >
        {Array.from(name.trim())[0]?.toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded bg-white p-0.5 dark:bg-zinc-200">
      {/* Keep original brand colors; a light backing makes dark transparent logos legible. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={iconUrl}
        src={proxyImg(iconUrl, 96)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => markFailed(iconUrl)}
        onLoad={(event) => {
          // The image proxy returns a successful 1×1 transparent GIF on upstream failure.
          if (event.currentTarget.naturalWidth <= 1 || event.currentTarget.naturalHeight <= 1) {
            markFailed(iconUrl);
          }
        }}
        // A server-rendered <img> can finish (or fail) before hydration attaches
        // onLoad/onError, so re-check its settled state once on mount.
        ref={(img) => {
          if (img?.complete && img.naturalWidth <= 1) markFailed(iconUrl);
        }}
        className="size-4 object-contain"
      />
    </span>
  );
}
