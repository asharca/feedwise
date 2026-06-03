"use client";

import { useEffect, useRef, useState } from "react";
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

function sinceToIso(s: SearchFilters["since"]): string | undefined {
  if (!s) return undefined;
  const now = Date.now();
  const days = s === "today" ? 1 : s === "7d" ? 7 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function useSearch(
  query: string,
  filters: SearchFilters,
  enabled: boolean
): { data: SearchData | null; loading: boolean } {
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable JSON of filters for the effect deps (object identity changes every render).
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length === 0) {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setData(null);
      setLoading(false);
      return;
    }

    const run = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      const p = new URLSearchParams({ q: trimmed });
      if (filters.feedId) p.set("feedId", filters.feedId);
      if (filters.folderId) p.set("folderId", filters.folderId);
      if (filters.tagId) p.set("tag", filters.tagId);
      if (filters.unread) p.set("unread", "true");
      if (filters.starred) p.set("starred", "true");
      const since = sinceToIso(filters.since);
      if (since) p.set("since", since);

      fetch("/api/search?" + p, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (controller.signal.aborted) return;
          if (body?.success) setData(body.data as SearchData);
        })
        .catch((err: unknown) => {
          if ((err as Error)?.name !== "AbortError") {
            // Soft-fail; no toast spam during keystrokes
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(run, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, filtersKey, enabled]);

  return { data, loading };
}
