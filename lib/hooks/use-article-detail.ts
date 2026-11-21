"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { fetchArticleDetail, patchArticle } from "@/lib/reader/article-api";
import { updateArticleInPages } from "@/lib/reader/article-cache";
import type { ArticleListItem, CursorPage, ReaderArticleDetail } from "@/lib/reader/types";

export interface UseArticleDetailOptions {
  /** Mark the article read (server PATCH + unread-delta event) when it opens unread. */
  markReadOnOpen: boolean;
  /** Called after an unread article was marked read on open. */
  onMarkedRead?: (articleId: string) => void;
  /** Called when the automatic mark-read-on-open request fails. */
  onMarkReadFailed?: (articleId: string) => void;
}

export interface UseArticleDetailResult {
  detail: ReaderArticleDetail | null;
  setDetail: Dispatch<SetStateAction<ReaderArticleDetail | null>>;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

function isArticlePages(value: unknown): value is InfiniteData<CursorPage<ArticleListItem>> {
  if (!value || typeof value !== "object" || !("pages" in value) || !Array.isArray(value.pages)) {
    return false;
  }
  if (value.pages.length === 0) return true;
  const first: unknown = value.pages[0];
  return Boolean(
    first && typeof first === "object" && "items" in first && Array.isArray(first.items),
  );
}

/**
 * URL-driven article detail backed by TanStack Query (`queryKeys.article.detail(id)`).
 * Optionally marks an unread article as read once on open and syncs list + feed caches.
 */
export function useArticleDetail(
  articleId: string | undefined,
  { markReadOnOpen, onMarkedRead, onMarkReadFailed }: UseArticleDetailOptions,
): UseArticleDetailResult {
  const queryClient = useQueryClient();
  const currentIdRef = useRef<string | undefined>(articleId);
  currentIdRef.current = articleId;

  const callbacksRef = useRef({ onMarkedRead, onMarkReadFailed });
  callbacksRef.current = { onMarkedRead, onMarkReadFailed };

  const attemptedMarkReadRef = useRef<Set<string>>(new Set());

  const query = useQuery({
    queryKey: articleId ? queryKeys.article.detail(articleId) : ["article", "__idle__"],
    queryFn: ({ signal }) => fetchArticleDetail(articleId!, signal),
    enabled: Boolean(articleId),
  });

  const markReadMutation = useMutation({
    mutationFn: ({ id }: { id: string; feedId: string }) => patchArticle(id, { isRead: true }),
    onSuccess: (_data, { id, feedId }) => {
      queryClient.setQueryData<ReaderArticleDetail>(queryKeys.article.detail(id), (prev) =>
        prev ? { ...prev, isRead: true } : prev,
      );
      const cachedLists = queryClient.getQueriesData({ queryKey: queryKeys.articles.all });
      for (const [key, data] of cachedLists) {
        if (!isArticlePages(data)) continue;
        const updated = updateArticleInPages(data, id, { isRead: true });
        if (updated !== data) queryClient.setQueryData(key, updated);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      if (feedId) dispatchUnreadDelta(feedId, -1);
      if (currentIdRef.current === id) {
        callbacksRef.current.onMarkedRead?.(id);
      }
    },
    onError: (_err, { id }) => {
      if (currentIdRef.current === id) {
        callbacksRef.current.onMarkReadFailed?.(id);
      }
    },
  });

  const { mutate: triggerMarkRead } = markReadMutation;

  useEffect(() => {
    if (!articleId) return;
    const data = query.data;
    if (!markReadOnOpen || !data || data.id !== articleId || data.isRead) return;
    if (attemptedMarkReadRef.current.has(articleId)) return;
    attemptedMarkReadRef.current.add(articleId);
    triggerMarkRead({ id: articleId, feedId: data.feedId });
  }, [articleId, markReadOnOpen, query.data, triggerMarkRead]);

  // Allow re-attempting if the user navigates away and opens the article again later.
  useEffect(() => {
    return () => {
      if (articleId) attemptedMarkReadRef.current.delete(articleId);
    };
  }, [articleId]);

  const setDetail = useCallback<Dispatch<SetStateAction<ReaderArticleDetail | null>>>(
    (value) => {
      if (!articleId) return;
      queryClient.setQueryData<ReaderArticleDetail | undefined>(
        queryKeys.article.detail(articleId),
        (previous) => {
          const next = typeof value === "function" ? value(previous ?? null) : value;
          return next ?? undefined;
        },
      );
    },
    [articleId, queryClient],
  );

  const retry = useCallback(() => {
    if (!articleId) return;
    void query.refetch();
  }, [articleId, query]);

  return {
    detail: articleId ? (query.data ?? null) : null,
    setDetail,
    loading: Boolean(articleId) && query.isPending,
    error: articleId && query.error ? query.error.message || "文章加载失败" : null,
    retry,
  };
}
