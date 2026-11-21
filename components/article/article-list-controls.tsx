"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LayoutGrid, List } from "lucide-react";
import type { ContentView } from "@/lib/db/schema-types";
import { cn } from "@/lib/utils";

const VIEW_KEY = "feedwise:article-view";
const VIEW_EVENT = "feedwise:article-view-change";
type ArticleView = "list" | "cards";

export const CONTENT_VIEW_OPTIONS: ReadonlyArray<{
  value: ContentView | undefined;
  label: string;
}> = [
  { value: undefined, label: "全部" },
  { value: "article", label: "文章" },
  { value: "social", label: "社交" },
  { value: "picture", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
];

function isEditableOrOverlayTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='dialog'], [role='alertdialog'], [role='menu'], [role='combobox']",
    ),
  );
}

function subscribeView(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEW_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEW_EVENT, onChange);
  };
}

function readView(): ArticleView {
  try {
    return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}

export function useArticleView() {
  const savedView = useSyncExternalStore(subscribeView, readView, () => "list" as const);
  const [temporaryView, setTemporaryView] = useState<ArticleView | null>(null);
  function setView(view: ArticleView) {
    try {
      localStorage.setItem(VIEW_KEY, view);
      setTemporaryView(null);
      window.dispatchEvent(new Event(VIEW_EVENT));
    } catch {
      // A blocked storage area must not prevent switching the current view.
      setTemporaryView(view);
    }
  }
  return [temporaryView ?? savedView, setView] as const;
}

export function ArticleViewToggle({
  view,
  onChange,
}: {
  view: ArticleView;
  onChange: (view: ArticleView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="文章显示方式"
      className="inline-flex shrink-0 gap-0.5 rounded-md border border-border bg-muted/50 p-0.5"
    >
      {(["list", "cards"] as const).map((value) => {
        const Icon = value === "list" ? List : LayoutGrid;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-xs transition-colors",
              view === value
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {value === "list" ? "列表" : "卡片"}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Content-view switcher: 全部 / 文章 / 社交 / 图片 / 视频 / 音频.
 * Emits `undefined` for 全部 so callers omit the `view` query param.
 */
export function ContentViewSwitcher({
  value,
  onChange,
  className,
}: {
  value: ContentView | undefined;
  onChange: (next: ContentView | undefined) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="内容视图"
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-muted/50 p-0.5 scrollbar-none",
        className,
      )}
    >
      {CONTENT_VIEW_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-7 shrink-0 items-center rounded px-2 text-xs transition-colors",
              active
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tracks an element's width via ResizeObserver for responsive virtualized grid columns. */
export function useContainerWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element) {
      setWidth(0);
      return;
    }
    const update = () => {
      const next = element.clientWidth;
      setWidth((prev) => (prev === next ? prev : next));
    };
    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return width;
}

export interface ArticleSelectionShortcuts {
  onSelect?: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  onMarkRead?: (id: string, read: boolean) => void;
  onScrollToArticle?: (id: string) => void;
}

/**
 * j/k moves focus without marking articles read; Enter opens the focused row;
 * s/m/o operate on the currently focused item when no article reader is open.
 */
export function useArticleSelection(
  articles: readonly {
    id: string;
    url?: string | null;
    isRead?: boolean;
    isStarred?: boolean;
  }[],
  activeId: string | undefined,
  root: HTMLElement | null,
  view: string,
  shortcuts: ArticleSelectionShortcuts = {},
) {
  const { onSelect, onStar, onMarkRead, onScrollToArticle } = shortcuts;
  const [focused, setFocused] = useState<{ id: string; activeId: string | undefined } | null>(null);
  const selectedId =
    focused && focused.activeId === activeId && articles.some((item) => item.id === focused.id)
      ? focused.id
      : activeId;

  useEffect(() => {
    if (!root || !selectedId) return;
    onScrollToArticle?.(selectedId);
    const frame = requestAnimationFrame(() => {
      const row = root.querySelector<HTMLElement>(`[data-article-id="${CSS.escape(selectedId)}"]`);
      row?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [articles, onScrollToArticle, root, selectedId, view]);

  useEffect(() => {
    if (!root) return;
    function onKey(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (isEditableOrOverlayTarget(event.target)) return;
      if (!root || root.getClientRects().length === 0 || !articles.length) return;

      if (event.key === "j" || event.key === "k") {
        const current = articles.findIndex((item) => item.id === selectedId);
        const next =
          current < 0
            ? event.key === "j"
              ? 0
              : articles.length - 1
            : Math.max(0, Math.min(articles.length - 1, current + (event.key === "j" ? 1 : -1)));
        const id = articles[next].id;
        event.preventDefault();
        setFocused({ id, activeId });
        onScrollToArticle?.(id);
        requestAnimationFrame(() => {
          const row = root.querySelector<HTMLElement>(`[data-article-id="${CSS.escape(id)}"]`);
          row
            ?.querySelector<HTMLButtonElement>("[data-article-open]")
            ?.focus({ preventScroll: true });
          row?.scrollIntoView({ block: "nearest", behavior: "instant" });
        });
        return;
      }

      const targetArticle = selectedId
        ? articles.find((item) => item.id === selectedId)
        : undefined;
      if (!targetArticle) return;

      // Only handle s/m/o from the list when no reader is active (page-level
      // reader shortcuts handle them when an article is open so they never fire twice).
      if (activeId) return;

      if (event.key === "Enter" && onSelect) {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement && activeEl.matches("button, a, audio, video")) {
          return;
        }
        event.preventDefault();
        onSelect(targetArticle.id);
      } else if (event.key === "s" && onStar) {
        event.preventDefault();
        onStar(targetArticle.id, !targetArticle.isStarred);
      } else if (event.key === "m" && onMarkRead) {
        event.preventDefault();
        onMarkRead(targetArticle.id, !targetArticle.isRead);
      } else if (event.key === "o" && targetArticle.url) {
        event.preventDefault();
        window.open(targetArticle.url, "_blank", "noopener,noreferrer");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [articles, activeId, onMarkRead, onScrollToArticle, onSelect, onStar, root, selectedId]);

  return selectedId;
}

/**
 * Page-level reader shortcuts when an article is open:
 * - `s`: toggle star
 * - `m`: toggle read/unread
 * - `o`: open original URL in a new tab
 * - `Escape`: close active article
 */
export function useReaderShortcuts({
  article,
  onStar,
  onMarkRead,
  onClose,
}: {
  article: { id: string; url?: string | null; isRead: boolean; isStarred: boolean } | null;
  onStar: (id: string, starred: boolean) => void;
  onMarkRead: (id: string, read: boolean) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!article) return;
    const current = article;

    function onKey(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (isEditableOrOverlayTarget(event.target)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "s") {
        event.preventDefault();
        onStar(current.id, !current.isStarred);
      } else if (event.key === "m") {
        event.preventDefault();
        onMarkRead(current.id, !current.isRead);
      } else if (event.key === "o" && current.url) {
        event.preventDefault();
        window.open(current.url, "_blank", "noopener,noreferrer");
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [article, onClose, onMarkRead, onStar]);
}
