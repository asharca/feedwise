"use client";

import { memo } from "react";
import DOMPurify from "dompurify";

/**
 * Replace third-party `<iframe>` embeds with a safe external link so no
 * third-party frame loads without an explicit user click.
 */
function replaceIframesWithLinks(html: string): string {
  return html.replace(/<iframe\b([^>]*)>[\s\S]*?<\/iframe>/gi, (_match, attrs: string) => {
    const srcMatch = attrs.match(/\ssrc=(["'])(https?:\/\/[^"']+)\1/i);
    if (!srcMatch) return "";
    const url = srcMatch[2];
    const safeUrl = url.replace(/"/g, "&quot;");
    return `<p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">打开嵌入媒体：${safeUrl}</a></p>`;
  });
}

/**
 * Downscale body images to the 1280 WebP tier via `/api/image-proxy` with
 * lazy async decoding to prevent mobile WebKit bitmap eviction flashes.
 */
export function proxyImagesInHtml(html: string): string {
  return html.replace(
    /(<img\b[^>]*?\ssrc=)(["'])(https?:\/\/[^"']+)\2/gi,
    (_, prefix, quote, url) =>
      `${prefix}${quote}/api/image-proxy?url=${encodeURIComponent(url)}&w=1280${quote} loading="lazy" decoding="async"`,
  );
}

/** Sanitize article HTML with DOMPurify and proxy remote body images. */
export function prepareArticleBodyHtml(html: string | null | undefined): string {
  if (!html) return "";
  const withoutIframes = replaceIframesWithLinks(html);
  const sanitized =
    typeof window === "undefined"
      ? withoutIframes
      : DOMPurify.sanitize(withoutIframes, {
          ADD_ATTR: ["target"],
          FORBID_TAGS: ["form", "object", "embed", "iframe"],
        });
  return proxyImagesInHtml(sanitized);
}

/**
 * The article body, isolated in a memoized component. ArticleReader re-renders
 * on every scroll frame (scroll-progress state); without this memo the
 * `dangerouslySetInnerHTML` below re-injects on each render, destroying and
 * recreating all `<img>` nodes and causing visible flicker on iOS WebKit.
 */
export const ArticleBody = memo(function ArticleBody({ html }: { html: string }) {
  return <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />;
});
