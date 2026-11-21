import type { ArticleMedia } from "@/lib/db/schema-types";

/** Format duration in seconds to mm:ss or hh:mm:ss. */
export function formatDuration(seconds: number | undefined | null): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** Extract the first HTTPS image URL from an HTML string. */
export function extractFirstImage(html: string | null | undefined): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["'](https:\/\/[^"'>\s]+)["']/i);
  return match?.[1] ?? null;
}

/** Collect deduplicated image media entries for an article, falling back to imageUrl / inline img. */
export function getArticleImages(article: {
  imageUrl?: string | null;
  media?: ArticleMedia[] | null;
  summary?: string | null;
}): ArticleMedia[] {
  const result: ArticleMedia[] = [];
  const seen = new Set<string>();

  for (const item of article.media ?? []) {
    if (item.type === "image" && item.url && !seen.has(item.url)) {
      seen.add(item.url);
      result.push(item);
    }
  }

  if (result.length === 0) {
    const fallback = article.imageUrl || extractFirstImage(article.summary);
    if (fallback && !seen.has(fallback)) {
      result.push({ url: fallback, type: "image" });
    }
  }

  return result;
}

export function getFirstVideoMedia(media?: ArticleMedia[] | null): ArticleMedia | null {
  if (!media) return null;
  return media.find((m) => m.type === "video" && Boolean(m.url)) ?? null;
}

export function getFirstAudioMedia(media?: ArticleMedia[] | null): ArticleMedia | null {
  if (!media) return null;
  return media.find((m) => m.type === "audio" && Boolean(m.url)) ?? null;
}

/** Compute responsive grid column count from the container's pixel width. */
export function computeGridColumns(containerWidth: number, minColumnWidth = 240, gap = 12): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  return Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
}

export interface VideoPlatformInfo {
  provider: "youtube" | "bilibili";
  label: string;
}

/** Identify third-party video platforms that should open as external links rather than auto-loaded iframes. */
export function detectVideoPlatform(url: string | null | undefined): VideoPlatformInfo | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      return { provider: "youtube", label: "在 YouTube 打开" };
    }
    if (
      host === "bilibili.com" ||
      host.endsWith(".bilibili.com") ||
      host === "b23.tv" ||
      host === "player.bilibili.com"
    ) {
      return { provider: "bilibili", label: "在 Bilibili 打开" };
    }
    return null;
  } catch {
    return null;
  }
}
