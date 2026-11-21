import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArticleList } from "@/components/article/article-list";
import { ContentViewSwitcher } from "@/components/article/article-list-controls";
import { DatedArticleListPane } from "@/components/article/dated-article-list-pane";

vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));
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

describe("ArticleList mixed content views", () => {
  it("renders each item by its own view (social, picture, video, audio)", () => {
    const { container } = render(
      createElement(ArticleList, {
        articles: [
          {
            id: "s1",
            feedTitle: "X",
            feedIconUrl: null,
            author: "@alice",
            title: "Social update",
            summary: "Quick status post",
            view: "social",
            media: [{ url: "https://img.example.com/s.jpg", type: "image" }],
            isRead: false,
            isStarred: false,
          },
          {
            id: "p1",
            feedTitle: "Photos",
            feedIconUrl: null,
            title: "Sunset shot",
            view: "picture",
            media: [
              { url: "https://img.example.com/p.jpg", type: "image", width: 800, height: 600 },
            ],
            isRead: false,
            isStarred: false,
          },
          {
            id: "v1",
            feedTitle: "Tube",
            feedIconUrl: null,
            title: "Demo clip",
            view: "video",
            media: [
              {
                url: "https://video.example.com/v.mp4",
                type: "video",
                previewUrl: "https://img.example.com/thumb.jpg",
                duration: 125,
              },
            ],
            isRead: false,
            isStarred: false,
          },
          {
            id: "au1",
            feedTitle: "Podcast",
            feedIconUrl: null,
            title: "Episode 1",
            view: "audio",
            media: [{ url: "https://cdn.example.com/ep1.mp3", type: "audio", duration: 600 }],
            isRead: false,
            isStarred: false,
          },
        ],
        onSelect: vi.fn(),
        onStar: vi.fn(),
      }),
    );

    expect(container.querySelector('[data-content-view="social"]')).toBeTruthy();
    expect(screen.getByText("@alice")).toBeTruthy();
    expect(container.querySelector('[data-content-view="picture"]')).toBeTruthy();
    const videoEl = container.querySelector('[data-content-view="video"]');
    expect(videoEl).toBeTruthy();
    expect(videoEl?.getAttribute("data-layout")).toBe("row");
    expect(screen.getByText("2:05")).toBeTruthy();
    const audioEl = container.querySelector('[data-content-view="audio"] audio');
    expect(audioEl?.getAttribute("preload")).toBe("none");
    expect(audioEl?.getAttribute("src")).toBe("https://cdn.example.com/ep1.mp3");
  });
});

describe("DatedArticleListPane video & picture grids", () => {
  it("lays out video and picture views as multi-column grids even in list mode", async () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1170);
    const now = new Date().toISOString();
    const makeVideo = (id: string) => ({
      id,
      feedId: "f1",
      feedTitle: "Tube",
      feedIconUrl: null,
      title: `Video ${id}`,
      view: "video" as const,
      media: [{ url: `https://video.example.com/${id}.mp4`, type: "video" as const, duration: 90 }],
      publishedAt: now,
      createdAt: now,
      isRead: false,
      isStarred: false,
    });

    const { container, rerender } = render(
      createElement(DatedArticleListPane, {
        title: "全部文章",
        search: "",
        onSearchChange: vi.fn(),
        contentView: "video",
        onContentViewChange: vi.fn(),
        articles: [makeVideo("v1"), makeVideo("v2"), makeVideo("v3")],
        dateField: "publishedAt",
        onSelect: vi.fn(),
        layout: "grid",
      }),
    );

    await waitFor(() => {
      const grid = container.querySelector<HTMLElement>('[style*="grid-template-columns"]');
      expect(grid?.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    });
    expect(
      container.querySelector('[data-content-view="video"]')?.getAttribute("data-layout"),
    ).toBe("card");

    // In mixed list (全部 / contentView undefined) in list mode, video items render as compact rows.
    rerender(
      createElement(DatedArticleListPane, {
        title: "全部文章",
        search: "",
        onSearchChange: vi.fn(),
        contentView: undefined,
        onContentViewChange: vi.fn(),
        articles: [makeVideo("v1")],
        dateField: "publishedAt",
        onSelect: vi.fn(),
        layout: "grid",
      }),
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-content-view="video"]')?.getAttribute("data-layout"),
      ).toBe("row");
    });

    // Picture view at 1170px uses min ~220px per column -> 4 columns.
    const makePic = (id: string) => ({
      id,
      feedId: "f2",
      feedTitle: "Photos",
      feedIconUrl: null,
      title: `Pic ${id}`,
      view: "picture" as const,
      media: [{ url: `https://img.example.com/${id}.jpg`, type: "image" as const }],
      publishedAt: now,
      createdAt: now,
      isRead: false,
      isStarred: false,
    });
    rerender(
      createElement(DatedArticleListPane, {
        title: "全部文章",
        search: "",
        onSearchChange: vi.fn(),
        contentView: "picture",
        onContentViewChange: vi.fn(),
        articles: [makePic("p1"), makePic("p2"), makePic("p3"), makePic("p4")],
        dateField: "publishedAt",
        onSelect: vi.fn(),
        layout: "grid",
      }),
    );

    await waitFor(() => {
      const grid = container.querySelector<HTMLElement>('[style*="grid-template-columns"]');
      expect(grid?.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    });
    widthSpy.mockRestore();
  });
});

describe("ContentViewSwitcher", () => {
  it("emits undefined for 全部 and ContentView values for specific tabs", () => {
    const onChange = vi.fn();
    render(createElement(ContentViewSwitcher, { value: undefined, onChange }));

    fireEvent.click(screen.getByRole("button", { name: "视频" }));
    expect(onChange).toHaveBeenCalledWith("video");

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
