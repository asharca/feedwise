import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RealtimeBridge, invalidateForEvent } from "@/components/realtime/realtime-bridge";
import type { FeedwiseEvent } from "@/lib/events/types";
import { queryKeys } from "@/lib/query/keys";
import { createQueryWrapper, createTestQueryClient } from "./query-wrapper";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(event: FeedwiseEvent) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("invalidateForEvent", () => {
  it.each<FeedwiseEvent>([
    { type: "articles.new", feedId: "f1", count: 2 },
    { type: "feed.fetched", feedId: "f1" },
    { type: "feed.error", feedId: "f1", errorCode: "timeout", message: "Timeout" },
    { type: "feed.deleted", subscriptionId: "s1", feedId: "f1" },
  ])("invalidates articles, feeds, and dashboard on $type", (event) => {
    const client = createTestQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    invalidateForEvent(client, event);

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.articles.all });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.feeds.all });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
  });

  it("invalidates only the matching article detail on article.updated", () => {
    const client = createTestQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    invalidateForEvent(client, { type: "article.updated", articleId: "art-42" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.article.detail("art-42") });
  });
});

describe("RealtimeBridge", () => {
  it("opens one EventSource to /api/sse and routes events to query invalidations", () => {
    const client = createTestQueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    const { unmount } = render(createElement(RealtimeBridge), {
      wrapper: createQueryWrapper(client),
    });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/sse");

    MockEventSource.instances[0].emit({ type: "article.updated", articleId: "a9" });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.article.detail("a9") });

    unmount();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });
});
