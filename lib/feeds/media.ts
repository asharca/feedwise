import type { ItunesNs, MediaNs } from "feedsmith";
import type { ArticleMedia } from "@/lib/db/schema-types";
import { absoluteUrl, videoLink } from "./item";

interface Candidate {
  url?: string;
  type?: string;
  medium?: string;
  width?: number;
  height?: number;
  duration?: number;
}

function mediaType(c: Candidate, url: string): ArticleMedia["type"] | null {
  const type = c.medium || c.type?.split("/")[0];
  if (type === "image" || type === "audio" || type === "video") return type;
  const path = new URL(url).pathname;
  if (/\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(path)) return "audio";
  if (/\.(mp4|mov|webm|m4v)$/i.test(path) || videoLink(url)) return "video";
  if (/\.(jpe?g|png|gif|webp|avif|svg)$/i.test(path)) return "image";
  return null;
}

export function parseMedia(
  base: string | undefined,
  enclosures: Candidate[] = [],
  ns?: MediaNs.ItemOrFeed,
  itunes?: ItunesNs.Item,
): ArticleMedia[] {
  const result = new Map<string, ArticleMedia>();
  function add(c: Candidate, preview?: string) {
    const url = absoluteUrl(c.url, base);
    if (!url) return;
    const type = mediaType(c, url);
    if (!type) return;
    const previous = result.get(url);
    result.set(url, {
      type,
      url,
      mimeType: c.type ?? previous?.mimeType,
      width: c.width ?? previous?.width,
      height: c.height ?? previous?.height,
      duration:
        type !== "image" ? (c.duration ?? previous?.duration ?? itunes?.duration) : undefined,
      previewUrl:
        type !== "image"
          ? (absoluteUrl(preview ?? itunes?.image, base) ?? previous?.previewUrl)
          : undefined,
    });
  }
  for (const c of enclosures) add(c, ns?.thumbnails?.[0]?.url);
  function group(g: MediaNs.Group) {
    for (const c of g.contents ?? []) {
      add(c, c.thumbnails?.[0]?.url ?? g.thumbnails?.[0]?.url ?? ns?.thumbnails?.[0]?.url);
      for (const t of c.thumbnails ?? []) add({ ...t, medium: "image" });
    }
    for (const t of g.thumbnails ?? []) add({ ...t, medium: "image" });
  }
  if (ns) group(ns);
  for (const g of ns?.groups ?? []) group(g);
  if (itunes?.image) add({ url: itunes.image, medium: "image" });
  return [...result.values()];
}
