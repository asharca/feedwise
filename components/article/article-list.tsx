"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Star, Inbox } from "lucide-react";
import { cn, proxyImg } from "@/lib/utils";

interface Article {
  id: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary: string | null;
  imageUrl?: string | null;
  publishedAt: Date | null;
  createdAt: Date | null;
  isRead: boolean;
  isStarred: boolean;
}

/** Prefer article's own pubdate, fall back to when we fetched/created it. */
function displayedAt(article: { publishedAt: Date | null; createdAt: Date | null }): Date | null {
  return article.publishedAt ?? article.createdAt;
}

interface ArticleListProps {
  articles: Article[];
  activeId?: string;
  onSelect: (id: string) => void;
  onStar: (id: string, starred: boolean) => void;
  compact?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  searchQuery?: string;
}

function Highlight({ text, query }: { text: string; query?: string }) {
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

export function ArticleList({
  articles,
  activeId,
  onSelect,
  onStar,
  compact = false,
  hasMore,
  loadingMore,
  onLoadMore,
  searchQuery,
}: ArticleListProps) {
  // Callback ref state so InfiniteScrollSentinel can use the actual scroll
  // container (not the viewport) as the IntersectionObserver root — the list
  // is inside an overflow-y-auto wrapper.
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8">
        <div className="size-14 rounded-lg bg-muted flex items-center justify-center">
          <Inbox className="size-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm">No articles</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div ref={setScrollRoot} className="overflow-y-auto h-full scrollbar-thin">
        <div className="flex flex-col gap-px p-1.5">
          {articles.map((article) => (
            <div
              key={article.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(article.id)}
              className={cn(
                "group relative flex gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-100",
                activeId === article.id ? "bg-accent" : "hover:bg-accent/50",
                article.isRead && activeId !== article.id && "opacity-55",
              )}
            >
              {!article.isRead && (
                <span className="absolute left-1 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-primary shrink-0" />
              )}
              <div className="flex-1 min-w-0 pl-1">
                <div className="flex items-center gap-1 mb-0.5">
                  {article.feedIconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxyImg(article.feedIconUrl)}
                      alt=""
                      decoding="async"
                      className="size-3 rounded-sm shrink-0"
                    />
                  )}
                  <span className="text-[10px] text-muted-foreground/70 truncate">
                    {article.feedTitle ?? "Unknown"}
                  </span>
                  {displayedAt(article) && (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-auto">
                      {formatDistanceToNow(displayedAt(article)!, { addSuffix: false })}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-[12px] leading-snug line-clamp-2",
                    !article.isRead ? "font-semibold" : "font-normal text-foreground/75",
                  )}
                >
                  <Highlight text={article.title ?? "(No title)"} query={searchQuery} />
                </p>
              </div>
              {article.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImg(article.imageUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-10 rounded-md object-cover shrink-0 self-center"
                />
              )}
              {article.isStarred && (
                <Star className="absolute top-2 right-2 size-2.5 fill-yellow-400 text-yellow-400" />
              )}
            </div>
          ))}
        </div>
        <InfiniteScrollSentinel
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
          root={scrollRoot}
        />
      </div>
    );
  }

  return (
    <div ref={setScrollRoot} className="overflow-y-auto h-full scrollbar-thin">
      <div className="p-3 sm:p-4 columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-2.5 [&>*]:break-inside-avoid [&>*]:mb-2.5">
        {articles.map((article) => {
          const excerpt = article.summary
            ? article.summary.replace(/<[^>]*>/g, "").slice(0, 140)
            : null;

          return (
            <div
              key={article.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(article.id)}
              className={cn(
                "group relative flex flex-col rounded-md overflow-hidden border bg-card",
                "cursor-pointer transition-colors duration-150",
                activeId === article.id
                  ? "border-primary"
                  : "border-border hover:border-foreground/20",
                article.isRead && activeId !== article.id && "opacity-55",
              )}
            >
              {article.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImg(article.imageUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-32 object-cover shrink-0"
                />
              )}
              <div className="flex flex-col flex-1 p-3">
                <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                  {article.feedIconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxyImg(article.feedIconUrl)}
                      alt=""
                      decoding="async"
                      className="size-3 rounded-sm shrink-0"
                    />
                  )}
                  <span className="text-[10px] text-muted-foreground/80 font-medium truncate">
                    {article.feedTitle ?? "Unknown"}
                  </span>
                  {displayedAt(article) && (
                    <>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">·</span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {formatDistanceToNow(displayedAt(article)!, { addSuffix: true })}
                      </span>
                    </>
                  )}
                </div>
                <p
                  className={cn(
                    "text-[13px] leading-snug line-clamp-3 mb-1",
                    !article.isRead
                      ? "font-semibold text-foreground"
                      : "font-normal text-foreground/75",
                  )}
                >
                  <Highlight text={article.title ?? "(No title)"} query={searchQuery} />
                </p>
                {excerpt && (
                  <p className="text-[11px] text-muted-foreground/65 line-clamp-2 leading-relaxed mt-auto pt-1">
                    <Highlight text={excerpt} query={searchQuery} />
                  </p>
                )}
              </div>
              {!article.isRead && (
                <span className="absolute top-2.5 left-2.5 size-1.5 rounded-full bg-primary" />
              )}
              {article.isStarred ? (
                <Star className="absolute top-2.5 right-2.5 size-3 fill-yellow-400 text-yellow-400" />
              ) : (
                <button
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-md hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStar(article.id, true);
                  }}
                >
                  <Star className="size-3 text-muted-foreground/40 hover:text-yellow-400 transition-colors" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <InfiniteScrollSentinel
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        root={scrollRoot}
      />
    </div>
  );
}

/**
 * Invisible sentinel at the bottom of the list — uses IntersectionObserver
 * (with the list's own scroll container as root) to call onLoadMore when it
 * scrolls into view. `rootMargin: 400px` triggers the next page slightly
 * before the user actually hits the bottom, so paging feels seamless.
 */
function InfiniteScrollSentinel({
  hasMore,
  loadingMore,
  onLoadMore,
  root,
}: {
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  root?: HTMLElement | null;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && hasMore && !loadingMore) {
            onLoadMore();
          }
        }
      },
      { root: root ?? null, rootMargin: "400px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, root]);

  if (!hasMore) return null;
  return (
    <div ref={sentinelRef} className="flex justify-center py-4" aria-hidden="true">
      {loadingMore && (
        <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
      )}
    </div>
  );
}
