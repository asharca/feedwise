import { useEffect, useState, useTransition } from "react";
import type { Dispatch, SetStateAction } from "react";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { fetchArticleDetail, patchArticle } from "@/lib/reader/article-api";
import type { ReaderArticleDetail } from "@/lib/reader/types";

export interface UseArticleDetailOptions {
  /** Mark the article read (server PATCH + unread-delta event) when it opens unread. */
  markReadOnOpen: boolean;
  /** Called after an unread article was marked read on open. */
  onMarkedRead?: (articleId: string) => void;
}

export interface UseArticleDetailResult {
  detail: ReaderArticleDetail | null;
  setDetail: Dispatch<SetStateAction<ReaderArticleDetail | null>>;
}

/**
 * URL-driven article detail: fetches whenever `articleId` changes, clears
 * when it goes away, and (optionally) marks the article read on open. The
 * state update is wrapped in a transition so the heavy reader mount can't
 * block an in-flight slide-in animation.
 */
export function useArticleDetail(
  articleId: string | undefined,
  { markReadOnOpen, onMarkedRead }: UseArticleDetailOptions,
): UseArticleDetailResult {
  const [detail, setDetail] = useState<ReaderArticleDetail | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!articleId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await fetchArticleDetail(articleId);
      if (cancelled || !data) return;
      startTransition(() => {
        setDetail(data);
      });
      if (markReadOnOpen && !data.isRead) {
        patchArticle(articleId, { isRead: true });
        if (data.feedId) dispatchUnreadDelta(data.feedId, -1);
        onMarkedRead?.(articleId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // markReadOnOpen/onMarkedRead intentionally excluded: the fetch must run
    // exactly once per articleId change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  return { detail, setDetail };
}
