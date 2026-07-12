"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";
import { cn, proxyImg } from "@/lib/utils";

export interface ArticleCardItem {
  id: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string | null;
  isRead?: boolean;
  isStarred?: boolean;
}

interface Props {
  article: ArticleCardItem;
  active?: boolean;
  onSelect: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  searchQuery?: string;
  /** Override the displayed timestamp (e.g. readAt for history view). */
  displayedAt?: Date | string | null;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

/** Extract the first HTTPS image URL from an HTML string. HTTP URLs are skipped
 *  because they often fail through the image proxy due to hotlink restrictions. */
function extractFirstImage(html: string | null | undefined): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["'](https:\/\/[^"'>\s]+)["']/i);
  return match?.[1] ?? null;
}

/** Highlights search matches in plain text. */
export function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query || !text) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit rounded-[2px] px-px"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function FeedMeta({
  feedIconUrl,
  feedTitle,
  relTime,
}: {
  feedIconUrl: string | null;
  feedTitle: string | null;
  relTime: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {feedIconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(feedIconUrl, 96)} alt="" decoding="async" className="size-3 rounded-sm shrink-0" />
      )}
      <span className="truncate font-medium">{feedTitle ?? "Unknown"}</span>
      {relTime && (
        <>
          <span className="text-muted-foreground/40 shrink-0">·</span>
          <span className="text-muted-foreground/60 shrink-0 whitespace-nowrap">{relTime}</span>
        </>
      )}
    </div>
  );
}

/**
 * Unified article card used in every grid view (reader, history, starred,
 * tags, dashboard). Two layouts based on whether the article has a thumbnail:
 *
 *  • Image card  — thumbnail top (h-32) + compact text below
 *  • Text card   — full-height typography layout with title + excerpt preview
 *
 * Both variants share the same outer dimensions (h-56) so the grid is uniform.
 */
export function ArticleCard({
  article,
  active = false,
  onSelect,
  onStar,
  searchQuery,
  displayedAt,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  const isRead = Boolean(article.isRead);
  // Fall back to the first inline HTTPS image in the RSS summary when the feed
  // doesn't provide a dedicated cover image (enclosure / media:content).
  const effectiveImageUrl =
    article.imageUrl || extractFirstImage(article.summary ?? null) || null;
  // Treat as text card if no URL found, or if the image failed to load.
  const hasImage = Boolean(effectiveImageUrl) && !imgFailed;

  const date =
    toDate(displayedAt) ??
    toDate(article.publishedAt) ??
    toDate(article.createdAt);
  const relTime = date ? formatDistanceToNow(date, { addSuffix: true }) : null;

  // Always compute excerpt — used by the text card layout (when !hasImage).
  const excerpt = article.summary
    ? article.summary
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300)
    : null;

  return (
    <article
      className={cn(
        "group relative flex h-60 w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors duration-200 ease-[var(--ease-out)] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
        active
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-foreground/30",
        !active && isRead && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(article.id)}
        aria-label={`Read ${article.title ?? "untitled article"}`}
        className="absolute inset-0 z-10 rounded-lg outline-none"
      />

      {/* Unread indicator dot */}
      {!isRead && !active && (
        <span className="absolute top-2.5 left-2.5 size-1.5 rounded-full bg-primary z-10" />
      )}

      {hasImage ? (
        <>
          {/* ── Image card: thumbnail on top, title only below ── */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyImg(effectiveImageUrl!, 480)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-full h-32 object-cover shrink-0"
          />
          <div className="pointer-events-none flex flex-1 flex-col overflow-hidden p-3">
            <FeedMeta
              feedIconUrl={article.feedIconUrl}
              feedTitle={article.feedTitle}
              relTime={relTime}
            />
            <h4
              className={cn(
                "mt-1.5 line-clamp-2 text-sm leading-snug",
                !isRead
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground/80",
                !active && "group-hover:text-primary transition-colors",
              )}
            >
              <Highlight text={article.title ?? "(untitled)"} query={searchQuery} />
            </h4>
          </div>
        </>
      ) : (
        /* ── Text card: full height, more content shown ── */
        <div className="pointer-events-none flex h-full flex-col p-4">
          <FeedMeta
            feedIconUrl={article.feedIconUrl}
            feedTitle={article.feedTitle}
            relTime={relTime}
          />
          <h4
            className={cn(
              "mt-2 line-clamp-4 text-sm leading-snug",
              !isRead
                ? "font-semibold text-foreground"
                : "font-medium text-foreground/80",
              !active && "group-hover:text-primary transition-colors",
            )}
          >
            <Highlight text={article.title ?? "(untitled)"} query={searchQuery} />
          </h4>
          {excerpt && (
            <p className="mt-2 line-clamp-5 text-xs leading-relaxed text-muted-foreground">
              {excerpt}
            </p>
          )}
        </div>
      )}

      {/* Star: badge if starred, hover button if onStar provided */}
      {onStar ? (
        <button
          type="button"
          className={cn(
            "absolute right-1.5 top-1.5 z-20 inline-flex size-8 items-center justify-center rounded-md bg-background/85 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-yellow-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            article.isStarred && "text-yellow-500 opacity-100",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onStar(article.id, !article.isStarred);
          }}
          aria-label={article.isStarred ? "Unstar article" : "Star article"}
        >
          <Star className={cn("size-4", article.isStarred && "fill-current")} />
        </button>
      ) : article.isStarred ? (
        <Star className="absolute right-2.5 top-2.5 z-20 size-3 fill-yellow-400 text-yellow-400" />
      ) : null}
    </article>
  );
}
