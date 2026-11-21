"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CircleAlert, Inbox, RefreshCw, Search as SearchIcon, X } from "lucide-react";
import type { ArticleMedia, ContentView } from "@/lib/db/schema-types";
import { computeGridColumns } from "@/lib/reader/media";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CardEnter } from "@/components/motion/card-enter";
import { ArticleItemRenderer } from "./article-item-renderer";
import {
  ArticleViewToggle,
  ContentViewSwitcher,
  useArticleSelection,
  useArticleView,
  useContainerWidth,
} from "./article-list-controls";
import {
  buildDateGroupedVirtualRows,
  estimateVirtualRowSize,
  FALLBACK_VIEWPORT_RECT,
  observeScrollRect,
} from "./virtual-rows";

export interface DatedArticleItem {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  url?: string | null;
  title: string | null;
  author?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  media?: ArticleMedia[] | null;
  view?: ContentView;
  isRead?: boolean;
  isStarred?: boolean;
  publishedAt?: Date | string | null;
  createdAt?: Date | string | null;
  readAt?: Date | string | null;
}

export type DateField = "readAt" | "publishedAt" | "createdAt";
export type PaneLayout = "compact" | "grid";

interface Props {
  title: string;
  headerIcon?: React.ComponentType<{ className?: string }>;
  headerActions?: React.ReactNode;

  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /** Optional content-view filter switcher (全部 / 文章 / 社交 / 图片 / 视频 / 音频). */
  contentView?: ContentView;
  onContentViewChange?: (view: ContentView | undefined) => void;

  articles: DatedArticleItem[];
  dateField: DateField;
  activeId?: string;
  onSelect: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  onMarkRead?: (id: string, read: boolean) => void;

  /** Compact constrains an open reader's side pane to rows. Grid allows the
   * persisted list/card preference; the default preference is a compact list. */
  layout?: PaneLayout;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;

  emptyTitle?: string;
  emptyHint?: string;

  className?: string;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

function pickDate(item: DatedArticleItem, dateField: DateField): Date | null {
  if (dateField === "readAt") return toDate(item.readAt);
  if (dateField === "publishedAt") return toDate(item.publishedAt) ?? toDate(item.createdAt);
  return toDate(item.createdAt);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date, now: Date): string {
  const today = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = dayKey(d);
  if (key === today) return "今天";
  if (key === dayKey(yesterday)) return "昨天";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Shared virtualized pane that renders a searchable, date-grouped article list.
 * Supports list & responsive N-column card grids plus per-item content views.
 */
export function DatedArticleListPane({
  title,
  headerIcon: Icon,
  headerActions,
  search,
  onSearchChange,
  searchPlaceholder = "筛选文章…",
  contentView,
  onContentViewChange,
  articles,
  dateField,
  activeId,
  onSelect,
  onStar,
  onMarkRead,
  loading,
  error,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyTitle,
  emptyHint,
  className,
  layout = "compact",
}: Props) {
  const grouped = useMemo(() => {
    const now = new Date();
    const groups: { key: string; label: string; rows: DatedArticleItem[] }[] = [];
    for (const item of articles) {
      const d = pickDate(item, dateField);
      const key = d && !Number.isNaN(d.getTime()) ? dayKey(d) : "undated";
      const label = d && !Number.isNaN(d.getTime()) ? dayLabel(d, now) : "更早";
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.rows.push(item);
      } else {
        groups.push({ key, label, rows: [item] });
      }
    }
    return groups;
  }, [articles, dateField]);

  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const containerWidth = useContainerWidth(scrollRoot);
  const [view, setView] = useArticleView();

  // Video and picture views always use a responsive grid in both list and card modes
  // (unless constrained to a narrow side pane when an article is open).
  const isMediaGridView = contentView === "video" || contentView === "picture";
  const effectiveLayout =
    layout === "compact" ? "compact" : isMediaGridView || view === "cards" ? "grid" : "compact";

  const minCardWidth = contentView === "video" ? 280 : contentView === "picture" ? 220 : 240;
  const gridColumns =
    effectiveLayout === "grid"
      ? computeGridColumns(Math.max(0, containerWidth - 32), minCardWidth, 12)
      : 1;
  const { rows: virtualRows, articleRowIndex } = useMemo(
    () => buildDateGroupedVirtualRows(grouped, gridColumns),
    [grouped, gridColumns],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRoot,
    observeElementRect: observeScrollRect,
    estimateSize: (index) => estimateVirtualRowSize(virtualRows[index]),
    getItemKey: (index) => virtualRows[index]?.key ?? index,
    overscan: 6,
    initialRect: FALLBACK_VIEWPORT_RECT,
  });

  // Re-measure when layout or column count changes.
  useEffect(() => {
    virtualizer.measure();
  }, [effectiveLayout, gridColumns, virtualizer]);

  const scrollToArticle = useCallback(
    (id: string) => {
      const rowIndex = articleRowIndex.get(id);
      if (rowIndex !== undefined) {
        virtualizer.scrollToIndex(rowIndex, { align: "auto" });
      }
    },
    [articleRowIndex, virtualizer],
  );

  const selectedId = useArticleSelection(articles, activeId, scrollRoot, effectiveLayout, {
    onSelect,
    onStar,
    onMarkRead,
    onScrollToArticle: scrollToArticle,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  // Trigger next-page cursor fetch when scrolling near the end of virtualized rows.
  const loadMoreTriggeredForCountRef = useRef(-1);
  useEffect(() => {
    if (!hasMore || loadingMore || !onLoadMore || virtualRows.length === 0) return;
    if (lastVirtualIndex >= virtualRows.length - 5) {
      if (loadMoreTriggeredForCountRef.current === virtualRows.length) return;
      loadMoreTriggeredForCountRef.current = virtualRows.length;
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore, lastVirtualIndex, virtualRows.length]);

  useEffect(() => {
    if (!loadingMore) {
      loadMoreTriggeredForCountRef.current = -1;
    }
  }, [loadingMore, articles.length]);

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <SidebarTrigger className="md:hidden" />
        {Icon && <Icon className="size-4" />}
        <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
        {headerActions && <div className="ml-auto flex items-center gap-1">{headerActions}</div>}
      </div>

      <div className="shrink-0 space-y-2 px-3 pb-2 pt-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="筛选文章"
            className="h-11 w-full rounded-md border border-input bg-background pl-8 pr-11 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-9 md:pr-9 md:text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:right-0.5 md:size-9"
              aria-label="清除筛选"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {(onContentViewChange || layout !== "compact") && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {onContentViewChange ? (
              <ContentViewSwitcher value={contentView} onChange={onContentViewChange} />
            ) : (
              <span className="text-xs text-muted-foreground">j / k 切换 · 回车阅读</span>
            )}
            {layout !== "compact" && <ArticleViewToggle view={view} onChange={setView} />}
          </div>
        )}
      </div>

      <div ref={setScrollRoot} className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16" role="status">
            <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            <span className="sr-only">正在加载文章</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
          >
            <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10">
              <CircleAlert className="size-5 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">文章加载失败</p>
              <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
            </div>
            {onRetry && (
              <Button type="button" variant="outline" onClick={onRetry}>
                <RefreshCw className="size-4" />
                重试
              </Button>
            )}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-20 text-center text-muted-foreground">
            <Inbox className="size-10 text-muted-foreground/30" />
            <p className="text-sm font-medium">{emptyTitle ?? "暂无文章"}</p>
            {emptyHint && <p className="max-w-xs text-xs text-muted-foreground/70">{emptyHint}</p>}
          </div>
        ) : (
          <div className={cn("pb-8", effectiveLayout === "grid" ? "px-4" : "px-2")}>
            <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualItems.map((virtualItem) => {
                const row = virtualRows[virtualItem.index];
                if (!row) return null;
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    {row.kind === "header" ? (
                      <h3
                        className={cn(
                          "pb-1.5 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground",
                          effectiveLayout === "grid" ? "px-1" : "px-2",
                        )}
                      >
                        {row.label}
                      </h3>
                    ) : row.kind === "grid-row" ? (
                      <div
                        className="grid gap-3 pb-3"
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
                              displayedAt={pickDate(article, dateField)}
                              searchQuery={search}
                            />
                          </CardEnter>
                        ))}
                      </div>
                    ) : (
                      <div className="pb-1">
                        <ArticleItemRenderer
                          article={row.article}
                          mode="row"
                          active={selectedId === row.article.id}
                          onSelect={onSelect}
                          onStar={onStar}
                          displayedAt={pickDate(row.article, dateField)}
                          searchQuery={search}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center py-4" aria-hidden={!loadingMore}>
                {loadingMore ? (
                  <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                ) : onLoadMore ? (
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    加载更多
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
