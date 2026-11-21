"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import type { SnippetPart } from "@/lib/search/parse-snippet";

export interface ArticleHitDTO {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  titleParts: SnippetPart[];
  snippetParts: SnippetPart[];
  isRead: boolean;
  isStarred: boolean;
  publishedAt: string | null;
}

export interface FeedHitDTO {
  feedId: string;
  title: string | null;
  iconUrl: string | null;
  unreadCount: number;
}

export interface TagHitDTO {
  id: string;
  name: string;
  color: string | null;
  articleCount: number;
}

export interface SearchData {
  query: string;
  articles: ArticleHitDTO[];
  feeds: FeedHitDTO[];
  tags: TagHitDTO[];
}

export interface SearchFilters {
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unread: boolean;
  starred: boolean;
  since?: "today" | "7d" | "30d";
}

const DEBOUNCE_MS = 250;

function sinceToIso(s: SearchFilters["since"], now = Date.now()): string | undefined {
  if (!s) return undefined;
  const days = s === "today" ? 1 : s === "7d" ? 7 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildSearchParams(
  trimmedQuery: string,
  filters: SearchFilters,
  now = Date.now(),
): URLSearchParams {
  const p = new URLSearchParams({ q: trimmedQuery });
  if (filters.feedId) p.set("feedId", filters.feedId);
  if (filters.folderId) p.set("folderId", filters.folderId);
  if (filters.tagId) p.set("tag", filters.tagId);
  if (filters.unread) p.set("unread", "true");
  if (filters.starred) p.set("starred", "true");
  const since = sinceToIso(filters.since, now);
  if (since) p.set("since", since);
  return p;
}

export function useSearch(
  query: string,
  filters: SearchFilters,
  enabled: boolean,
): { data: SearchData | null; loading: boolean } {
  const trimmed = query.trim();
  const debouncedQuery = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const isActive = enabled && trimmed.length > 0;

  const searchQuery = useQuery({
    queryKey: queryKeys.search.query({
      q: debouncedQuery,
      feedId: filters.feedId ?? null,
      folderId: filters.folderId ?? null,
      tagId: filters.tagId ?? null,
      unread: filters.unread,
      starred: filters.starred,
      since: filters.since ?? null,
    }),
    queryFn: ({ signal }) => {
      const params = buildSearchParams(debouncedQuery, filters);
      return apiFetch<SearchData>(`/api/search?${params.toString()}`, { signal });
    },
    enabled: isActive && debouncedQuery.length > 0,
    retry: false,
  });

  return {
    data: isActive ? (searchQuery.data ?? null) : null,
    loading: isActive && (trimmed !== debouncedQuery || searchQuery.isFetching),
  };
}
