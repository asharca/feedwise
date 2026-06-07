"use client";

import { useEffect, useRef } from "react";
import type { FeedwiseEvent } from "@/lib/events/types";

export function useSSE(handler: (event: FeedwiseEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const es = new EventSource("/api/sse");
    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as FeedwiseEvent;
        handlerRef.current(event);
      } catch {
        // malformed message — ignore
      }
    };
    return () => es.close();
  }, []);
}
