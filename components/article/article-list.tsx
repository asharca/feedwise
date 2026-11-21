"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Inbox } from "lucide-react";
import { computeGridColumns } from "@/lib/reader/media";
import { cn } from "@/lib/utils";
import { CardEnter } from "@/components/motion/card-enter";
import type { ArticleCardItem } from "./article-card";
import { ArticleItemRenderer } from "./article-item-renderer";
import {
  ArticleViewToggle,
  useArticleSelection,
  useArticleView,
  useContainerWidth,
} from "./article-list-controls";
import {
  buildFlatVirtualRows,
  estimateVirtualRowSize,
  FALLBACK_VIEWPORT_RECT,
  observeScrollRect,
} from "./virtual-rows";
interface ArticleListProps {
  articles: ArticleCardItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  onStar: (id: string, starred: boolean) => void;
  onMarkRead?: (id: string, read: boolean) => void;
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
  onMarkRead,
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
  const activeScrollRoot = compact ? (externalScrollRoot ?? null) : scrollRoot;
  const containerWidth = useContainerWidth(scrollRoot);

  const gridColumns =
    effectiveView === "cards" ? computeGridColumns(Math.max(0, containerWidth - 24), 224, 10) : 1;
  const { rows: virtualRows, articleRowIndex } = useMemo(
    () => buildFlatVirtualRows(articles, gridColumns),
    [articles, gridColumns],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => activeScrollRoot,
    observeElementRect: observeScrollRect,
    estimateSize: (index) => estimateVirtualRowSize(virtualRows[index]),
    getItemKey: (index) => virtualRows[index]?.key ?? index,
    overscan: 6,
    initialRect: FALLBACK_VIEWPORT_RECT,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [effectiveView, gridColumns, virtualizer]);

  const scrollToArticle = useCallback(
    (id: string) => {
      const rowIndex = articleRowIndex.get(id);
      if (rowIndex !== undefined) {
        virtualizer.scrollToIndex(rowIndex, { align: "auto" });
      }
    },
    [articleRowIndex, virtualizer],
  );

  const selectedId = useArticleSelection(articles, activeId, activeScrollRoot, effectiveView, {
    onSelect,
    onStar,
    onMarkRead,
    onScrollToArticle: scrollToArticle,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  // Trigger next page when scrolled near the bottom in standalone virtualized mode.
  const loadMoreTriggeredForRef = useRef(-1);
  useEffect(() => {
    if (compact || !hasMore || loadingMore || !onLoadMore || virtualRows.length === 0) return;
    if (lastVirtualIndex >= virtualRows.length - 5) {
      if (loadMoreTriggeredForRef.current === virtualRows.length) return;
      loadMoreTriggeredForRef.current = virtualRows.length;
      onLoadMore();
    }
  }, [compact, hasMore, loadingMore, onLoadMore, lastVirtualIndex, virtualRows.length]);

  useEffect(() => {
    if (!loadingMore) loadMoreTriggeredForRef.current = -1;
  }, [loadingMore, articles.length]);

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

      <div className={effectiveView === "cards" ? "p-3 sm:p-4" : "p-2 sm:p-3"}>
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualItems.map((virtualItem) => {
            const row = virtualRows[virtualItem.index];
            if (!row || row.kind === "header") return null;
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                {row.kind === "grid-row" ? (
                  <div
                    className="grid gap-2.5 pb-2.5"
                    style={{
                      gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))`,
                    }}
                  >
                    {row.items.map(({ article, index }) => (
                      <CardEnter key={article.id} index={index}>
                        <ArticleItemRenderer
                          article={article}
                          mode="card"
                          active={selectedId === article.id}
                          onSelect={onSelect}
                          onStar={onStar}
                          searchQuery={searchQuery}
                        />
                      </CardEnter>
                    ))}
                  </div>
                ) : (
                  <div className="pb-0.5">
                    <ArticleItemRenderer
                      article={row.article}
                      mode="row"
                      active={selectedId === row.article.id}
                      onSelect={onSelect}
                      onStar={onStar}
                      searchQuery={searchQuery}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
 * (with the owning scroll container as root) to call onLoadMore when it
 * scrolls into view.
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
        <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      )}
    </div>
  );
}
