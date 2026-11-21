import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import { htmlToText } from "@/lib/utils";
import type { ArticleMedia } from "@/lib/db/schema-types";

export interface ParsedArticle {
  guid: string;
  url: string | null;
  title: string | null;
  author: string | null;
  contentHtml: string | null;
  contentText: string | null;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  media: ArticleMedia[];
}

export function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export function absoluteUrl(value?: string | null, base?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value, base ?? undefined);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function videoLink(value: string | null): boolean {
  if (!value) return false;
  try {
    return /(?:^|\.)(?:youtube\.com|youtu\.be|bilibili\.com|b23\.tv|vimeo\.com)$/.test(
      new URL(value).hostname,
    );
  } catch {
    return false;
  }
}

export function parsedItem(
  input: {
    guid?: string;
    url?: string;
    title?: string;
    author?: string;
    html?: string;
    text?: string;
    summary?: string;
    date?: string;
    media: ArticleMedia[];
  },
  base?: string,
): ParsedArticle {
  const url = absoluteUrl(input.url, base);
  const media = input.media;
  if (videoLink(url) && !media.some((m) => m.type === "video"))
    media.push({ type: "video", url: url! });
  const date = input.date ? new Date(input.date) : null;
  const publishedAt = date && !Number.isNaN(date.valueOf()) ? date : null;
  const contentText = input.text ?? htmlToText(input.html ?? input.summary ?? "");
  let imageUrl = media.find((m) => m.type === "image")?.url ?? null;
  if (!imageUrl && input.html?.toLowerCase().includes("<img")) {
    const img = parseHTML(input.html).document.querySelector("img[src]");
    imageUrl = absoluteUrl(img?.getAttribute("src"), url ?? base);
  }
  return {
    guid:
      input.guid?.trim() ||
      url ||
      sha1(
        [input.title, publishedAt?.toISOString(), (input.html ?? contentText).slice(0, 512)].join(
          "|",
        ),
      ),
    url,
    title: input.title ?? null,
    author: input.author ?? null,
    contentHtml: input.html ?? null,
    contentText: contentText || null,
    summary: input.summary ? htmlToText(input.summary) : null,
    media,
    imageUrl,
    publishedAt,
  };
}
