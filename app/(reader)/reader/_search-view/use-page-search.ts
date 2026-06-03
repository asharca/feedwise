"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSearch, type SearchFilters } from "@/lib/hooks/use-search";

export interface PageSearchFilters extends SearchFilters {}

/**
 * Page-scoped search hook for the reader `/reader?search=...` route.
 *
 * Mirrors `useSearch` (debounced fetch, abort on unmount) but adds:
 *   - filter state sourced from and synced to URL search params
 *   - `setFilter` / `toggleFilter` / `clearFilters` mutators that
 *     `router.replace` (no scroll, no flash)
 *
 * The page is mounted only when `?search=` is non-empty, so `q` is
 * read-only after mount — typing lives in the ⌘K palette.
 */
export function usePageSearch(q: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading } = useSearch(q, filtersFromParams(searchParams), true);

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const writeFilters = useCallback(
    (next: PageSearchFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      applyFiltersToParams(params, next);
      router.replace(`/reader?${params.toString()}`);
    },
    [router, searchParams]
  );

  const setFilter = useCallback(
    (key: "feedId" | "folderId" | "tagId" | "since", value: string | undefined) => {
      writeFilters({ ...filters, [key]: value });
    },
    [writeFilters, filters]
  );

  const toggleFilter = useCallback(
    (key: "unread" | "starred") => {
      // unread and starred are mutually exclusive (reader has a single `view`).
      if (key === "unread") {
        const next = !filters.unread;
        writeFilters({ ...filters, unread: next, starred: next ? false : filters.starred });
      } else {
        const next = !filters.starred;
        writeFilters({ ...filters, starred: next, unread: next ? false : filters.unread });
      }
    },
    [writeFilters, filters]
  );

  const clearFilters = useCallback(() => {
    writeFilters({ unread: false, starred: false });
  }, [writeFilters]);

  return { data, loading, filters, setFilter, toggleFilter, clearFilters };
}

export function filtersFromParams(sp: URLSearchParams): PageSearchFilters {
  return {
    feedId: sp.get("feedId") ?? undefined,
    folderId: sp.get("folderId") ?? undefined,
    tagId: sp.get("tag") ?? undefined,
    since: (sp.get("since") as "today" | "7d" | "30d" | null) ?? undefined,
    unread: sp.get("view") === "unread",
    starred: sp.get("view") === "starred",
  };
}

export function applyFiltersToParams(params: URLSearchParams, f: PageSearchFilters) {
  if (f.feedId) params.set("feedId", f.feedId);
  else params.delete("feedId");
  if (f.folderId) params.set("folderId", f.folderId);
  else params.delete("folderId");
  if (f.tagId) params.set("tag", f.tagId);
  else params.delete("tag");
  if (f.since) params.set("since", f.since);
  else params.delete("since");
  if (f.starred) params.set("view", "starred");
  else if (f.unread) params.set("view", "unread");
  else params.delete("view");
}
