"use client";

import { useCallback, useEffect, useState } from "react";

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

async function request<T>(url: string, signal: AbortSignal, method = "GET"): Promise<T> {
  const response = await fetch(url, { signal, method, cache: "no-store" });
  if (!response.ok) throw new Error("请求失败，请稍后重试");
  const body = await response.json();
  if (!body.success) {
    throw new Error(typeof body.error === "string" ? body.error : "请求失败，请稍后重试");
  }
  return body.data as T;
}

function useHotResource<T>(url: string) {
  const [state, setState] = useState<{
    url: string;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ url, data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setState((previous) => ({
        url,
        data: previous.url === url ? previous.data : null,
        loading: true,
        error: null,
      }));
      try {
        const data = await request<T>(url, current.signal);
        if (!current.signal.aborted) setState({ url, data, loading: false, error: null });
      } catch (error) {
        if (!current.signal.aborted) {
          setState((previous) => ({
            ...previous,
            loading: false,
            error: error instanceof Error ? error.message : "加载失败，请稍后重试",
          }));
        }
      }
    };
    void load();
    const loadVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(loadVisible, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", loadVisible);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", loadVisible);
    };
  }, [url, revision]);

  return {
    data: state.url === url ? state.data : null,
    loading: state.url !== url || state.loading,
    error: state.url === url ? state.error : null,
    reload,
  };
}

export function useHot(category: HotCategory | "all") {
  const boards = useHotResource<{ boards: HotBoard[] }>(`/api/hot?category=${category}`);
  const trending = useHotResource<HotTrending>("/api/hot/trending");
  const reloadBoards = boards.reload;
  const reloadTrending = trending.reload;
  const reload = useCallback(() => {
    reloadBoards();
    reloadTrending();
  }, [reloadBoards, reloadTrending]);
  return { boards, trending, reload };
}

export function refreshHotSource(key: string, signal: AbortSignal) {
  return request<{ queued: true }>(`/api/hot/${encodeURIComponent(key)}/refresh`, signal, "POST");
}
