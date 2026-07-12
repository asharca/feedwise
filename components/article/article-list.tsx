"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Star, Inbox } from "lucide-react";
import { cn, proxyImg } from "@/lib/utils";
import { CardEnter } from "@/components/motion/card-enter";
import { ArticleCard, Highlight } from "./article-card";

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
  scrollRoot?: HTMLElement | null;
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
  scrollRoot: externalScrollRoot,
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
      <div>
        <div className="flex flex-col gap-px p-1.5">
          {articles.map((article) => (
            <div
              key={article.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(article.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(article.id);
                }
              }}
              aria-label={`Read ${article.title ?? "untitled article"}`}
              className={cn(
                "group relative flex cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring",
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
                      src={proxyImg(article.feedIconUrl, 96)}
                      alt=""
                      decoding="async"
                      className="size-3 rounded-sm shrink-0"
                    />
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    {article.feedTitle ?? "Unknown"}
                  </span>
                  {displayedAt(article) && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(displayedAt(article)!, { addSuffix: false })}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "line-clamp-2 text-sm leading-snug",
                    !article.isRead ? "font-semibold" : "font-normal text-foreground/75",
                  )}
                >
                  <Highlight text={article.title ?? "(No title)"} query={searchQuery} />
                </p>
              </div>
              {article.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImg(article.imageUrl, 96)}
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
          root={externalScrollRoot}
        />
      </div>
    );
  }

  return (
    <div ref={setScrollRoot} className="overflow-y-auto h-full scrollbar-thin">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2.5 p-3 sm:p-4">
        {articles.map((article, index) => (
          <CardEnter key={article.id} index={index}>
            <ArticleCard
              article={article}
              active={activeId === article.id}
              onSelect={onSelect}
              onStar={onStar}
              searchQuery={searchQuery}
            />
          </CardEnter>
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
    if (!hasMore || !onLoadMore || !root) return;
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
      { root, rootMargin: "400px 0px" },
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
