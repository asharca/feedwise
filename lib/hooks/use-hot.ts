"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

export type HotCategory = "news" | "tech" | "community" | "entertainment";

export interface HotSourceInfo {
  key: string;
  name: string;
  category: HotCategory;
  homeUrl: string | null;
}

export interface HotItem {
  id: string;
  title: string;
  url: string;
  rank: number;
  heat: number | null;
  rankDelta: number | null;
  isNew: boolean;
  firstSeenAt: string;
  cover: string | null;
  desc: string | null;
}

export interface HotBoard {
  source: HotSourceInfo;
  status: "ok" | "error" | "empty";
  error: string | null;
  fetchedAt: string | null;
  items: HotItem[];
}

export interface HotTrending {
  rising: Array<HotItem & { source: HotSourceInfo }>;
  crossPlatform: Array<{
    title: string;
    sources: Array<{ source: HotSourceInfo; title: string; url: string; rank: number }>;
  }>;
}

const HOT_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useHot(category: HotCategory | "all") {
  const queryClient = useQueryClient();

  const boardsQuery = useQuery({
    queryKey: queryKeys.hot.boards(category),
    queryFn: ({ signal }) =>
      apiFetch<{ boards: HotBoard[] }>(`/api/hot?category=${category}`, { signal }),
    refetchInterval: HOT_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const trendingQuery = useQuery({
    queryKey: queryKeys.hot.trending(),
    queryFn: ({ signal }) => apiFetch<HotTrending>("/api/hot/trending", { signal }),
    refetchInterval: HOT_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const reloadBoards = useCallback(() => {
    void boardsQuery.refetch();
  }, [boardsQuery]);

  const reloadTrending = useCallback(() => {
    void trendingQuery.refetch();
  }, [trendingQuery]);

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.hot.all });
  }, [queryClient]);

  return {
    boards: {
      data: boardsQuery.data ?? null,
      loading: boardsQuery.isFetching,
      error: boardsQuery.error
        ? boardsQuery.error instanceof Error
          ? boardsQuery.error.message
          : "加载失败，请稍后重试"
        : null,
      reload: reloadBoards,
    },
    trending: {
      data: trendingQuery.data ?? null,
      loading: trendingQuery.isFetching,
      error: trendingQuery.error
        ? trendingQuery.error instanceof Error
          ? trendingQuery.error.message
          : "加载失败，请稍后重试"
        : null,
      reload: reloadTrending,
    },
    reload,
  };
}

export function refreshHotSource(key: string, signal?: AbortSignal) {
  return apiFetch<{ queued: true }>(`/api/hot/${encodeURIComponent(key)}/refresh`, {
    method: "POST",
    signal,
  });
}

export function useRefreshHotSource() {
  return useMutation({
    mutationFn: (key: string) => refreshHotSource(key),
  });
}
