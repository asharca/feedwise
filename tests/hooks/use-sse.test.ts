import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSSE } from "@/lib/hooks/use-sse";
import type { FeedwiseEvent } from "@/lib/events/types";

// Minimal EventSource mock
class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

vi.stubGlobal("EventSource", MockEventSource);

beforeEach(() => {
  MockEventSource.instances = [];
});

describe("useSSE", () => {
  it("connects to /api/sse on mount", () => {
    renderHook(() => useSSE(() => {}));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/sse");
  });

  it("calls handler with parsed event when message arrives", () => {
    const handler = vi.fn();
    renderHook(() => useSSE(handler));

    const es = MockEventSource.instances[0];
    const event: FeedwiseEvent = { type: "articles.new", feedId: "f1", count: 3 };
    es.emit(JSON.stringify(event));

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useSSE(() => {}));
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});
