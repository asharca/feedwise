import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { ArticleList } from "@/components/article/article-list";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArticleList pagination", () => {
  it("waits for the owning scroll container before observing the sentinel", async () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    let observerOptions: IntersectionObserverInit | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = () => [];

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observerCallback = callback;
        observerOptions = options;
      }
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const onLoadMore = vi.fn();
    const props: ComponentProps<typeof ArticleList> = {
      articles: [
        {
          id: "a1",
          feedTitle: "Feed",
          feedIconUrl: null,
          title: "Article",
          summary: null,
          publishedAt: null,
          createdAt: null,
          isRead: false,
          isStarred: false,
        },
      ],
      onSelect: vi.fn(),
      onStar: vi.fn(),
      compact: true,
      hasMore: true,
      loadingMore: false,
      onLoadMore,
      scrollRoot: null,
    };
    const { rerender } = render(createElement(ArticleList, props));

    expect(observe).not.toHaveBeenCalled();

    const scrollRoot = document.createElement("div");
    rerender(createElement(ArticleList, { ...props, scrollRoot }));
    await waitFor(() => expect(observe).toHaveBeenCalledTimes(1));
    expect(observerOptions?.root).toBe(scrollRoot);

    act(() => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
