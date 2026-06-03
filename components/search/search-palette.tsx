"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SearchInput } from "./search-input";
import { SearchResults } from "./search-results";
import {
  useSearch,
  type ArticleHitDTO,
  type FeedHitDTO,
  type SearchFilters,
  type TagHitDTO,
} from "@/lib/hooks/use-search";

interface PaletteState {
  query: string;
  filters: SearchFilters;
  activeKey: string | null;
}

type Action =
  | { type: "set-query"; q: string }
  | { type: "clear" }
  | { type: "set-active"; key: string }
  | { type: "move-active"; dir: 1 | -1; keys: string[] }
  | { type: "set-filter"; key: "feedId" | "folderId" | "tagId" | "since"; value: string | undefined }
  | { type: "toggle-filter"; key: "unread" | "starred" }
  | { type: "clear-filters" };

function reducer(state: PaletteState, action: Action): PaletteState {
  switch (action.type) {
    case "set-query":
      return { ...state, query: action.q, activeKey: null };
    case "clear":
      return { ...state, query: "", activeKey: null };
    case "set-active":
      return { ...state, activeKey: action.key };
    case "move-active": {
      const { keys, dir } = action;
      if (keys.length === 0) return state;
      const idx = state.activeKey ? keys.indexOf(state.activeKey) : -1;
      const next = idx < 0 ? 0 : Math.min(keys.length - 1, Math.max(0, idx + dir));
      return { ...state, activeKey: keys[next] };
    }
    case "set-filter":
      return {
        ...state,
        filters: { ...state.filters, [action.key]: action.value as never },
        activeKey: null,
      };
    case "toggle-filter": {
      // unread and starred are mutually exclusive (reader uses a single `view`).
      if (action.key === "unread") {
        const next = !state.filters.unread;
        return {
          ...state,
          filters: { ...state.filters, unread: next, starred: next ? false : state.filters.starred },
          activeKey: null,
        };
      }
      const next = !state.filters.starred;
      return {
        ...state,
        filters: { ...state.filters, starred: next, unread: next ? false : state.filters.unread },
        activeKey: null,
      };
    }
    case "clear-filters":
      return {
        ...state,
        filters: { unread: false, starred: false },
        activeKey: null,
      };
  }
}

interface Props {
  initialQuery: string;
  onClose: () => void;
}

/** Stable id for a result row given its activeKey. Used by aria-activedescendant. */
function rowId(activeKey: string | null): string | undefined {
  if (!activeKey) return undefined;
  // Replace `:` with `-` so the id is selector-safe even if anyone queries by it later.
  return "sp-row-" + activeKey.replace(":", "-");
}

export function SearchPalette({ initialQuery, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, dispatch] = useReducer(reducer, {
    query: initialQuery,
    filters: { unread: false, starred: false },
    activeKey: null,
  });

  const { data, loading } = useSearch(state.query, state.filters, true);

  // Flat list of activeKey candidates in DOM order. Used by ↑↓.
  const flatKeys = useMemo<string[]>(() => {
    if (!data) return [];
    return [
      ...data.articles.map((a) => "article:" + a.id),
      ...data.feeds.map((f) => "feed:" + f.feedId),
      ...data.tags.map((t) => "tag:" + t.id),
    ];
  }, [data]);

  // Default activeKey to first result when results arrive.
  useEffect(() => {
    if (!state.activeKey && flatKeys.length > 0) {
      dispatch({ type: "set-active", key: flatKeys[0] });
    }
  }, [flatKeys, state.activeKey]);

  function openArticle(a: ArticleHitDTO) {
    onClose();
    const onReader = pathname === "/reader" || pathname.startsWith("/reader/");
    const target = onReader ? pathname : "/reader";
    const p = new URLSearchParams(onReader ? searchParams.toString() : "");
    p.delete("search");
    p.set("articleId", a.id);
    router.push(`${target}?${p.toString()}`);
  }

  function openFeed(f: FeedHitDTO) {
    onClose();
    const p = new URLSearchParams();
    p.set("feedId", f.feedId);
    router.push(`/reader?${p.toString()}`);
  }

  function openTag(t: TagHitDTO) {
    onClose();
    const p = new URLSearchParams();
    p.set("tag", t.id);
    router.push(`/reader?${p.toString()}`);
  }

  function commitFullSearch() {
    const q = state.query.trim();
    if (!q) return;
    onClose();
    const p = new URLSearchParams();
    p.set("search", q);
    if (state.filters.feedId) p.set("feedId", state.filters.feedId);
    if (state.filters.folderId) p.set("folderId", state.filters.folderId);
    if (state.filters.tagId) p.set("tag", state.filters.tagId);
    if (state.filters.starred) p.set("view", "starred");
    else if (state.filters.unread) p.set("view", "unread");
    // `since` is palette-local; reader has no since param.
    router.push(`/reader?${p.toString()}`);
  }

  function onActivateByKey(key: string) {
    if (key.startsWith("article:") && data) {
      const id = key.slice("article:".length);
      const hit = data.articles.find((a) => a.id === id);
      if (hit) openArticle(hit);
    } else if (key.startsWith("feed:") && data) {
      const id = key.slice("feed:".length);
      const hit = data.feeds.find((f) => f.feedId === id);
      if (hit) openFeed(hit);
    } else if (key.startsWith("tag:") && data) {
      const id = key.slice("tag:".length);
      const hit = data.tags.find((t) => t.id === id);
      if (hit) openTag(hit);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      dispatch({ type: "move-active", dir: 1, keys: flatKeys });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      dispatch({ type: "move-active", dir: -1, keys: flatKeys });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) || !state.activeKey) {
        commitFullSearch();
      } else {
        onActivateByKey(state.activeKey);
      }
    }
  }

  const activeDescendantId = rowId(state.activeKey);

  return (
    <>
      <SearchInput
        ref={inputRef}
        value={state.query}
        onChange={(v) => dispatch({ type: "set-query", q: v })}
        onClear={() => {
          dispatch({ type: "clear" });
          inputRef.current?.focus();
        }}
        onKeyDown={onKeyDown}
        activeDescendantId={activeDescendantId}
      />
      <SearchResults
        query={state.query}
        loading={loading}
        articles={data?.articles ?? []}
        feeds={data?.feeds ?? []}
        tags={data?.tags ?? []}
        activeKey={state.activeKey}
        getRowId={rowId}
        onActivate={(key) => dispatch({ type: "set-active", key })}
        onOpenArticle={openArticle}
        onOpenFeed={openFeed}
        onOpenTag={openTag}
      />
      {state.query.trim().length > 0 && data && (data.articles.length > 0 || data.feeds.length > 0 || data.tags.length > 0) && (
        <button
          type="button"
          onClick={commitFullSearch}
          className="w-full text-left px-3 py-2 text-xs font-medium border-t border-border text-primary hover:bg-primary/5 transition-colors"
        >
          See all results for &ldquo;{state.query.trim()}&rdquo; →
        </button>
      )}
    </>
  );
}
