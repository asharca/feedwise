"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { CircleAlert, Inbox, RefreshCw, Search as SearchIcon, Star, X } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn, proxyImg } from "@/lib/utils";
import { CardEnter } from "@/components/motion/card-enter";
import { ArticleCard } from "./article-card";

export interface DatedArticleItem {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary?: string | null;
  imageUrl?: string | null;
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

  articles: DatedArticleItem[];
  dateField: DateField;
  activeId?: string;
  onSelect: (id: string) => void;

  /**
   * "compact" renders one row per article (default — used in the narrow
   * left column when a reader is open). "grid" lays cards out in a
   * responsive multi-column grid for the no-article-selected magazine
   * view. Date-grouped sections work in both modes.
   */
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
  if (key === today) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Shared pane that renders a searchable, date-grouped article list.
 * Used by the reading-history page and by every list view in the reader
 * (per-feed, folder, unread, starred, tags). Search is controlled — the
 * parent decides whether typing triggers a client filter or a server fetch.
 */
export function DatedArticleListPane({
  title,
  headerIcon: Icon,
  headerActions,
  search,
  onSearchChange,
  searchPlaceholder = "Filter…",
  articles,
  dateField,
  activeId,
  onSelect,
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
      if (!d) continue;
      const key = dayKey(d);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.rows.push(item);
      } else {
        groups.push({ key, label: dayLabel(d, now), rows: [item] });
      }
    }
    return groups;
  }, [articles, dateField]);

  // The infinite-scroll observer needs the pane's own scroll container (not
  // the viewport) as `root`, so the sentinel actually fires while the list
  // scrolls inside the pane.
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="px-3 h-11 flex items-center gap-2 shrink-0 border-b border-border">
        <SidebarTrigger className="md:hidden" />
        {Icon && <Icon className="size-4" />}
        <h2 className="text-sm font-semibold tracking-tight truncate">{title}</h2>
        {headerActions && <div className="ml-auto flex items-center gap-1">{headerActions}</div>}
      </div>

      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/70 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full rounded-md border border-input bg-background pl-8 pr-11 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:h-9 md:pr-9 md:text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:right-0.5 md:size-9"
              aria-label="Clear filter"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div ref={setScrollRoot} className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16" role="status">
            <div className="size-5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            <span className="sr-only">Loading articles</span>
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
              <p className="text-sm font-medium">Could not load articles</p>
              <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
            </div>
            {onRetry && (
              <Button type="button" variant="outline" onClick={onRetry}>
                <RefreshCw className="size-4" />
                Retry
              </Button>
            )}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-muted-foreground gap-2 text-center">
            <Inbox className="size-10 text-muted-foreground/30" />
            <p className="text-sm font-medium">{emptyTitle ?? "No articles"}</p>
            {emptyHint && <p className="text-xs text-muted-foreground/70 max-w-xs">{emptyHint}</p>}
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {/* Crossfade the grid↔compact swap that happens when an article
                opens/closes: the old layout dissolves out, then the new one
                dissolves in. ~0.3s total ≈ the list-column shrink spring, so
                the two read as one motion. MotionConfig (reader template)
                disables this under prefers-reduced-motion. */}
            <motion.div
              key={layout}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={cn("pb-8", layout === "grid" ? "px-4" : "px-2")}
            >
              {grouped.map((g) => (
                <section key={g.key} className="mt-4 first:mt-2">
                  <h3
                    className={cn(
                      "sticky top-0 z-10 bg-background pb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground",
                      layout === "grid" ? "px-1" : "px-2",
                    )}
                  >
                    {g.label}
                  </h3>
                  {layout === "grid" ? (
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
                      {g.rows.map((item, i) => (
                        <CardEnter key={item.id} index={i}>
                          <ArticleCard
                            article={item}
                            active={activeId === item.id}
                            onSelect={onSelect}
                            displayedAt={pickDate(item, dateField)}
                          />
                        </CardEnter>
                      ))}
                    </div>
                  ) : (
                    <ul className="space-y-0.5">
                      {g.rows.map((item) => (
                        <li key={item.id}>
                          <DatedArticleRow
                            item={item}
                            dateField={dateField}
                            active={activeId === item.id}
                            onOpen={() => onSelect(item.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              <InfiniteScrollSentinel
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={onLoadMore}
                root={scrollRoot}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/**
 * Invisible sentinel below the list. Fires onLoadMore via IntersectionObserver
 * when scrolled near the end (rootMargin pre-triggers so paging feels seamless).
 * Internal — kept colocated so the pane stays self-contained.
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
          if (entry.isIntersecting && hasMore && !loadingMore) onLoadMore();
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

function DatedArticleRow({
  item,
  dateField,
  active,
  onOpen,
}: {
  item: DatedArticleItem;
  dateField: DateField;
  active: boolean;
  onOpen: () => void;
}) {
  const d = pickDate(item, dateField);
  const relTime = d ? formatDistanceToNow(d, { addSuffix: true }) : "";
  const isRead = Boolean(item.isRead);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-md p-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        !active && isRead && "opacity-60",
      )}
    >
      {!isRead && !active && (
        <span className="absolute left-0.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-primary shrink-0" />
      )}
      {item.feedIconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyImg(item.feedIconUrl, 96)}
          alt=""
          className="size-5 rounded shrink-0 mt-0.5"
          decoding="async"
        />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm truncate",
            !isRead ? "font-semibold" : "font-medium",
            !active && "group-hover:text-primary transition-colors",
          )}
        >
          {item.title ?? "(untitled)"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {item.feedTitle ?? "Unknown feed"}
          {relTime && <span className="text-muted-foreground/70"> · {relTime}</span>}
        </p>
      </div>
      {item.isStarred && <Star className="size-3 fill-yellow-400 text-yellow-400 shrink-0 mt-1" />}
    </button>
  );
}
