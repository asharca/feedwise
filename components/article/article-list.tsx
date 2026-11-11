"use client";

import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardEnter } from "@/components/motion/card-enter";
import { ArticleCard } from "./article-card";
import { ArticleRow } from "./article-row";
import { ArticleViewToggle, useArticleSelection, useArticleView } from "./article-list-controls";

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
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useArticleView();
  const effectiveView = compact ? "list" : view;
  const selectedId = useArticleSelection(articles, activeId, scrollRoot, effectiveView);

  if (articles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
        <Inbox className="size-6" />
        <p className="text-sm">暂无文章</p>
      </div>
    );
  }

  return (
    <div ref={setScrollRoot} className={cn(!compact && "h-full overflow-y-auto scrollbar-thin")}>
      {!compact && (
        <div className="flex justify-end px-4 pt-3">
          <ArticleViewToggle view={view} onChange={setView} />
        </div>
      )}
      <div
        className={
          effectiveView === "cards"
            ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2.5 p-3 sm:p-4"
            : "flex flex-col gap-px p-2 sm:p-3"
        }
      >
        {articles.map((article, index) =>
          effectiveView === "cards" ? (
            <CardEnter key={article.id} index={index}>
              <ArticleCard
                article={article}
                active={selectedId === article.id}
                onSelect={onSelect}
                onStar={onStar}
                searchQuery={searchQuery}
              />
            </CardEnter>
          ) : (
            <ArticleRow
              key={article.id}
              article={article}
              active={selectedId === article.id}
              onSelect={onSelect}
              onStar={onStar}
              searchQuery={searchQuery}
            />
          ),
        )}
      </div>
      <InfiniteScrollSentinel
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        root={compact ? externalScrollRoot : scrollRoot}
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
