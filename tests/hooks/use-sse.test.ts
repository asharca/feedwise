import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSSE } from "@/lib/hooks/use-sse";
import type { FeedwiseEvent } from "@/lib/events/types";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((e: Event) => void) | null = null;
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
  triggerError() {
    this.onerror?.(new Event("error"));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  it("reconnects with exponential backoff on error and cancels timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSSE(() => {}));

    expect(MockEventSource.instances).toHaveLength(1);
    act(() => {
      MockEventSource.instances[0].triggerError();
    });
    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => {
      MockEventSource.instances[1].triggerError();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Backoff doubled to 2000ms
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockEventSource.instances).toHaveLength(3);

    unmount();
    expect(MockEventSource.instances[2].closed).toBe(true);
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useSSE(() => {}));
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});
