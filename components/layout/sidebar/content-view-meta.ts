import type { ContentView, FeedSourceType } from "@/lib/db/schema-types";
import type { Subscription } from "./types";

export const CONTENT_VIEW_LABELS: Record<ContentView, string> = {
  article: "文章",
  social: "社交",
  picture: "图片",
  video: "视频",
  audio: "音频",
};

export function getEffectiveView(
  sub: Pick<Subscription, "view" | "viewOverride" | "defaultView">,
): ContentView {
  return sub.view ?? sub.viewOverride ?? sub.defaultView ?? "article";
}

export function getSourceTypeLabel(sourceType?: FeedSourceType): string {
  return sourceType === "html" ? "网页抓取 (HTML)" : "RSS / Atom";
}

export function formatFetchInterval(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "自适应调度";
  if (minutes < 60) return `每 ${minutes} 分钟（自适应）`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return hours >= 24 && hours % 24 === 0
      ? `每 ${hours / 24} 天（自适应）`
      : `每 ${hours} 小时（自适应）`;
  }
  return `每 ${hours.toFixed(1)} 小时（自适应）`;
}

export function formatHtmlDisplayUrl(url: string, siteUrl?: string | null): string {
  if (siteUrl) return siteUrl;
  return url.replace(/#feedwise-html=[a-f0-9]+$/i, "");
}
