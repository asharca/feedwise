import { useCallback, useEffect, useState, useTransition } from "react";
import type { Dispatch, SetStateAction } from "react";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { fetchArticleDetail, patchArticle } from "@/lib/reader/article-api";
import type { ReaderArticleDetail } from "@/lib/reader/types";

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

interface DetailRequestState {
  articleId: string | undefined;
  detail: ReaderArticleDetail | null;
  loading: boolean;
  error: string | null;
}

/**
 * URL-driven article detail: fetches whenever `articleId` changes, clears
 * when it goes away, and (optionally) marks the article read on open. The
 * state update is wrapped in a transition so the heavy reader mount can't
 * block an in-flight slide-in animation.
 */
export function useArticleDetail(
  articleId: string | undefined,
  { markReadOnOpen, onMarkedRead, onMarkReadFailed }: UseArticleDetailOptions,
): UseArticleDetailResult {
  const [request, setRequest] = useState<DetailRequestState>({
    articleId: undefined,
    detail: null,
    loading: false,
    error: null,
  });
  const [retryCount, setRetryCount] = useState(0);
  const [, startTransition] = useTransition();

  const retry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const setDetail = useCallback<Dispatch<SetStateAction<ReaderArticleDetail | null>>>(
    (value) => {
      setRequest((previous) => {
        const current = previous.articleId === articleId ? previous.detail : null;
        const detail = typeof value === "function" ? value(current) : value;
        return { articleId, detail, loading: false, error: null };
      });
    },
    [articleId],
  );

  useEffect(() => {
    if (!articleId) {
      setRequest({ articleId: undefined, detail: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setRequest({ articleId, detail: null, loading: true, error: null });
    (async () => {
      const data = await fetchArticleDetail(articleId);
      if (cancelled) return;
      if (!data) {
        setRequest({
          articleId,
          detail: null,
          loading: false,
          error: "Failed to load article",
        });
        return;
      }

      const shouldMarkRead = markReadOnOpen && !data.isRead;
      let visibleDetail = data;
      if (shouldMarkRead) {
        try {
          await patchArticle(articleId, { isRead: true });
          visibleDetail = { ...data, isRead: true };
          if (data.feedId) dispatchUnreadDelta(data.feedId, -1);
          onMarkedRead?.(articleId);
        } catch {
          if (!cancelled) onMarkReadFailed?.(articleId);
        }
      }
      if (cancelled) return;
      startTransition(() => {
        setRequest({
          articleId,
          detail: visibleDetail,
          loading: false,
          error: null,
        });
      });
    })();
    return () => {
      cancelled = true;
    };
    // Option callbacks intentionally excluded: the fetch runs only
    // when the article changes or the user explicitly retries it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, retryCount]);

  const isCurrentRequest = request.articleId === articleId;
  return {
    detail: isCurrentRequest ? request.detail : null,
    setDetail,
    loading: articleId ? (isCurrentRequest ? request.loading : true) : false,
    error: isCurrentRequest ? request.error : null,
    retry,
  };
}
