"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEW_KEY = "feedwise:article-view";
const VIEW_EVENT = "feedwise:article-view-change";
type ArticleView = "list" | "cards";

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

/** j/k moves focus without marking articles read; Enter opens the focused row. */
export function useArticleSelection(
  articles: readonly { id: string }[],
  activeId: string | undefined,
  root: HTMLElement | null,
  view: string,
) {
  const [focused, setFocused] = useState<{ id: string; activeId: string | undefined } | null>(null);
  const selectedId =
    focused && focused.activeId === activeId && articles.some((item) => item.id === focused.id)
      ? focused.id
      : activeId;

  useEffect(() => {
    if (!root || !selectedId) return;
    const row = root.querySelector<HTMLElement>(`[data-article-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [articles, root, selectedId, view]);

  useEffect(() => {
    if (!root) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (event.key !== "j" && event.key !== "k") return;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='dialog'], [role='alertdialog'], [role='menu'], [role='combobox']",
        )
      )
        return;
      if (!root || root.getClientRects().length === 0 || !articles.length) return;
      const current = articles.findIndex((item) => item.id === selectedId);
      const next =
        current < 0
          ? event.key === "j"
            ? 0
            : articles.length - 1
          : Math.max(0, Math.min(articles.length - 1, current + (event.key === "j" ? 1 : -1)));
      const id = articles[next].id;
      const row = root.querySelector<HTMLElement>(`[data-article-id="${CSS.escape(id)}"]`);
      if (!row) return;
      event.preventDefault();
      setFocused({ id, activeId });
      row.querySelector<HTMLButtonElement>("[data-article-open]")?.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [articles, activeId, root, selectedId]);

  return selectedId;
}
