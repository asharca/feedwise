"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { FeedwiseEvent } from "@/lib/events/types";
import { useSSE } from "@/lib/hooks/use-sse";
import { queryKeys } from "@/lib/query/keys";

/**
 * Maps an incoming SSE event to TanStack Query invalidations per the shared
 * realtime contract.
 */
export function invalidateForEvent(queryClient: QueryClient, event: FeedwiseEvent): void {
  switch (event.type) {
    case "articles.new":
    case "feed.fetched":
    case "feed.error":
    case "feed.deleted":
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      return;
    case "article.updated":
      void queryClient.invalidateQueries({ queryKey: queryKeys.article.detail(event.articleId) });
      return;
  }
}

/**
 * Mounted once in `app/(reader)/layout.tsx`. Holds the single `/api/sse`
 * EventSource connection and translates server events into query invalidations.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();

  const handleEvent = useCallback(
    (event: FeedwiseEvent) => {
      invalidateForEvent(queryClient, event);
    },
    [queryClient],
  );

  useSSE(handleEvent);
  return null;
}
