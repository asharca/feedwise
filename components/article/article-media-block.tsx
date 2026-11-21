"use client";

import { ExternalLink, Headphones, Play } from "lucide-react";
import type { ArticleMedia } from "@/lib/db/schema-types";
import { detectVideoPlatform, formatDuration } from "@/lib/reader/media";
import { proxyImg } from "@/lib/utils";

interface ArticleMediaBlockProps {
  media: ArticleMedia[] | null | undefined;
  /** Whether the article body already renders inline images. */
  bodyHasImages: boolean;
  articleUrl?: string | null;
  title?: string | null;
}

/**
 * Renders video, audio, and (when absent from body HTML) image enclosures in
 * the article reader. Third-party video platforms (YouTube/Bilibili) render as
 * preview links rather than auto-loaded iframes.
 */
export function ArticleMediaBlock({
  media,
  bodyHasImages,
  articleUrl,
  title,
}: ArticleMediaBlockProps) {
  if (!media || media.length === 0) return null;

  const videos = media.filter((m) => m.type === "video" && Boolean(m.url));
  const audios = media.filter((m) => m.type === "audio" && Boolean(m.url));
  const images = bodyHasImages ? [] : media.filter((m) => m.type === "image" && Boolean(m.url));

  if (videos.length === 0 && audios.length === 0 && images.length === 0) return null;

  return (
    <div className="mb-6 space-y-4">
      {videos.map((video) => {
        const platform = detectVideoPlatform(video.url) ?? detectVideoPlatform(articleUrl);
        const duration = formatDuration(video.duration);
        const targetUrl = platform ? articleUrl || video.url : video.url;

        if (platform) {
          return (
            <a
              key={video.url}
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block overflow-hidden rounded-lg border border-border bg-muted"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-muted">
                {video.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxyImg(video.previewUrl, 1280)}
                    alt={title ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transform-gpu backface-hidden"
                  />
                ) : (
                  <div className="size-full bg-gradient-to-br from-muted to-muted-foreground/20" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-white transition-colors group-hover:bg-black/40">
                  <span className="flex size-12 items-center justify-center rounded-full bg-black/75 shadow-md">
                    <Play className="ml-0.5 size-5 fill-current" />
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-medium">
                    <ExternalLink className="size-3" />
                    {platform.label}
                  </span>
                </div>
                {duration && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
                    {duration}
                  </span>
                )}
              </div>
            </a>
          );
        }

        return (
          <div key={video.url} className="overflow-hidden rounded-lg border border-border bg-black">
            <video
              controls
              preload="metadata"
              poster={video.previewUrl ? proxyImg(video.previewUrl, 1280) : undefined}
              src={video.url}
              className="max-h-[480px] w-full"
            />
          </div>
        );
      })}

      {audios.map((audio) => {
        const duration = formatDuration(audio.duration);
        return (
          <div
            key={audio.url}
            className="rounded-lg border border-border bg-muted/40 p-3 space-y-2"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Headphones className="size-3.5 text-primary" aria-hidden="true" />
              <span className="font-medium text-foreground">音频附件</span>
              {duration && <span className="tabular-nums">{duration}</span>}
              {audio.mimeType && <span className="ml-auto">{audio.mimeType}</span>}
            </div>
            <audio
              controls
              preload="none"
              src={audio.url}
              className="w-full"
              aria-label={`播放音频：${title ?? "音频附件"}`}
            />
          </div>
        );
      })}

      {images.length > 0 && (
        <div className="space-y-3">
          {images.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.url}
              src={proxyImg(image.url, 1280)}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full rounded-lg border border-border object-contain"
            />
          ))}
        </div>
      )}
    </div>
  );
}
