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
    <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
      {feedIconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(feedIconUrl, 96)} alt="" decoding="sync" className="size-3 rounded-sm shrink-0" />
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(article.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(article.id);
      }}
      className={cn(
        "group relative text-left w-full flex flex-col rounded-lg overflow-hidden border bg-card cursor-pointer transition-colors duration-200 ease-[var(--ease-out)] h-56",
        active
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-foreground/30",
        !active && isRead && "opacity-60",
      )}
    >
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
            decoding="sync"
            onError={() => setImgFailed(true)}
            className="w-full h-32 object-cover shrink-0"
          />
          <div className="flex flex-col flex-1 overflow-hidden p-3">
            <FeedMeta
              feedIconUrl={article.feedIconUrl}
              feedTitle={article.feedTitle}
              relTime={relTime}
            />
            <h4
              className={cn(
                "text-[13px] leading-snug line-clamp-2 mt-1.5",
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
        <div className="flex flex-col h-full p-4">
          <FeedMeta
            feedIconUrl={article.feedIconUrl}
            feedTitle={article.feedTitle}
            relTime={relTime}
          />
          <h4
            className={cn(
              "text-[13px] leading-snug line-clamp-4 mt-2",
              !isRead
                ? "font-semibold text-foreground"
                : "font-medium text-foreground/80",
              !active && "group-hover:text-primary transition-colors",
            )}
          >
            <Highlight text={article.title ?? "(untitled)"} query={searchQuery} />
          </h4>
          {excerpt && (
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-5 mt-2">
              {excerpt}
            </p>
          )}
        </div>
      )}

      {/* Star: badge if starred, hover button if onStar provided */}
      {article.isStarred ? (
        <Star className="absolute top-2.5 right-2.5 size-3 fill-yellow-400 text-yellow-400 z-10" />
      ) : onStar ? (
        <button
          type="button"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent/80 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onStar(article.id, true);
          }}
          aria-label="Star article"
        >
          <Star className="size-3 text-muted-foreground/40 hover:text-yellow-400 transition-colors" />
        </button>
      ) : null}
    </div>
  );
}
