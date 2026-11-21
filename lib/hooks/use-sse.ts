"use client";

import { useEffect, useRef } from "react";
import type { FeedwiseEvent } from "@/lib/events/types";

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Subscribe to the single `/api/sse` event stream with exponential backoff
 * reconnection on errors.
 */
export function useSSE(handler: (event: FeedwiseEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let delayMs = INITIAL_RETRY_MS;

    function connect() {
      if (closed) return;
      const es = new EventSource("/api/sse");
      source = es;

      es.onopen = () => {
        delayMs = INITIAL_RETRY_MS;
      };

      es.onmessage = (e: MessageEvent) => {
        delayMs = INITIAL_RETRY_MS;
        try {
          const event = JSON.parse(String(e.data)) as FeedwiseEvent;
          handlerRef.current(event);
        } catch {
          // Malformed SSE payload — ignore.
        }
      };

      es.onerror = () => {
        es.close();
        if (source === es) source = null;
        if (closed) return;
        const wait = delayMs;
        delayMs = Math.min(delayMs * 2, MAX_RETRY_MS);
        retryTimer = window.setTimeout(connect, wait);
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, []);
}
