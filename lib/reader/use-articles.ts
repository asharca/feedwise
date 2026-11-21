"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/keys";
import { dispatchMarkAllRead, dispatchUnreadDelta } from "./events";
import {
  fetchArticlesPage,
  fetchFullContent,
  fetchHistoryPage,
  fetchRelatedArticles,
  fetchTags,
  markAllArticlesRead,
  patchArticle,
} from "./article-api";
import { markAllInPagesRead, updateArticleInPages } from "./article-cache";
import type {
  ArticleListFilter,
  ArticleListItem,
  CursorPage,
  HistoryArticleItem,
  ReaderArticleDetail,
} from "./types";

function isCursorInfiniteData(value: unknown): value is InfiniteData<CursorPage<ArticleListItem>> {
  if (!value || typeof value !== "object" || !("pages" in value) || !Array.isArray(value.pages)) {
    return false;
  }
  if (value.pages.length === 0) return true;
  const first: unknown = value.pages[0];
  return Boolean(
    first && typeof first === "object" && "items" in first && Array.isArray(first.items),
  );
}

/** Cursor-paginated articles list query. */
export function useArticlesInfinite(filter: ArticleListFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.articles.list(filter as Record<string, unknown>),
    queryFn: ({ pageParam, signal }) => fetchArticlesPage(filter, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

/** Cursor-paginated reading history query. */
export function useHistoryInfinite(search?: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.articles.history({ search: search ?? "" }),
    queryFn: ({ pageParam, signal }) => fetchHistoryPage(search, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: CursorPage<HistoryArticleItem>) =>
      lastPage.nextCursor ?? undefined,
  });
}

/** User tags with article counts. */
export function useTagsQuery() {
  return useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: ({ signal }) => fetchTags(signal),
  });
}

/** Related articles (near-duplicates from other subscribed feeds). */
export function useRelatedArticlesQuery(articleId: string | undefined) {
  return useQuery({
    queryKey: articleId ? queryKeys.article.related(articleId) : ["article", "__none__", "related"],
    queryFn: ({ signal }) => fetchRelatedArticles(articleId!, signal),
    enabled: Boolean(articleId),
  });
}

interface ToggleArticleVars {
  id: string;
  patch: { isRead?: boolean; isStarred?: boolean };
  feedId?: string;
}

interface ToggleArticleContext {
  previousLists: Array<[QueryKey, unknown]>;
  previousDetail: ReaderArticleDetail | undefined;
  unreadDelta: { feedId: string; delta: number } | null;
}

/**
 * Optimistic read/star toggle mutation. Updates every cached articles/history
 * infinite page AND the article detail cache, rolling back cleanly on failure.
 */
export function useArticleToggleMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ToggleArticleVars, ToggleArticleContext>({
    mutationFn: ({ id, patch }) => patchArticle(id, patch),
    onMutate: async ({ id, patch, feedId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.articles.all });
      await queryClient.cancelQueries({ queryKey: queryKeys.article.detail(id) });

      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.articles.all });
      const previousDetail = queryClient.getQueryData<ReaderArticleDetail>(
        queryKeys.article.detail(id),
      );

      // Determine previous read state and feedId for unread counter delta.
      let resolvedFeedId = feedId ?? previousDetail?.feedId;
      let prevRead = previousDetail?.isRead;
      if (resolvedFeedId === undefined || prevRead === undefined) {
        for (const [, data] of previousLists) {
          if (!isCursorInfiniteData(data)) continue;
          for (const page of data.pages) {
            const match = page.items.find((item) => item.id === id);
            if (match) {
              resolvedFeedId ??= match.feedId;
              prevRead ??= match.isRead;
              break;
            }
          }
          if (resolvedFeedId !== undefined && prevRead !== undefined) break;
        }
      }

      for (const [key, data] of previousLists) {
        if (!isCursorInfiniteData(data)) continue;
        const updated = updateArticleInPages(data, id, patch);
        if (updated !== data) {
          queryClient.setQueryData(key, updated);
        }
      }

      if (previousDetail) {
        queryClient.setQueryData<ReaderArticleDetail>(queryKeys.article.detail(id), {
          ...previousDetail,
          ...patch,
        });
      }

      let unreadDelta: { feedId: string; delta: number } | null = null;
      if (
        typeof patch.isRead === "boolean" &&
        resolvedFeedId &&
        prevRead !== undefined &&
        prevRead !== patch.isRead
      ) {
        unreadDelta = { feedId: resolvedFeedId, delta: patch.isRead ? -1 : 1 };
        dispatchUnreadDelta(unreadDelta.feedId, unreadDelta.delta);
      }

      return { previousLists, previousDetail, unreadDelta };
    },
    onError: (_err, { id, patch }, context) => {
      if (context) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
        if (context.previousDetail !== undefined) {
          queryClient.setQueryData(queryKeys.article.detail(id), context.previousDetail);
        }
        if (context.unreadDelta) {
          dispatchUnreadDelta(context.unreadDelta.feedId, -context.unreadDelta.delta);
        }
      }
      toast.error(patch.isStarred !== undefined ? "更新收藏状态失败" : "更新已读状态失败");
    },
    onSettled: (_data, _err, { patch }) => {
      if (patch.isRead !== undefined) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      }
    },
  });
}

/** Mark-all-read mutation: invalidates articles + feeds + dashboard on success. */
export function useMarkAllReadMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { feedId?: string; folderId?: string }>({
    mutationFn: (scope) => markAllArticlesRead(scope),
    onSuccess: (_data, scope) => {
      const cached = queryClient.getQueriesData({ queryKey: queryKeys.articles.all });
      for (const [key, data] of cached) {
        if (!isCursorInfiniteData(data)) continue;
        const updated = markAllInPagesRead(data);
        if (updated !== data) queryClient.setQueryData(key, updated);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      dispatchMarkAllRead(scope.feedId, scope.folderId);
      toast.success("已全部标记为已读");
    },
    onError: (err) => {
      toast.error(err.message || "标记全部已读失败");
    },
  });
}

/** Trigger on-demand full-text extraction and update detail cache. */
export function useFetchFullContentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (articleId: string) => fetchFullContent(articleId),
    onSuccess: (result, articleId) => {
      queryClient.setQueryData<ReaderArticleDetail>(queryKeys.article.detail(articleId), (prev) =>
        prev
          ? {
              ...prev,
              fullContentHtml: result.html ?? prev.fullContentHtml ?? null,
              fullContentStatus: result.status,
            }
          : prev,
      );
      if (result.status === "ok" && result.html) {
        toast.success("全文抓取成功");
      } else {
        toast.error("全文抓取失败");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "全文抓取失败");
    },
  });
}
