import { createElement, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { UNREAD_DELTA_EVENT, type UnreadDeltaDetail } from "@/lib/reader/events";
import { patchArticle } from "@/lib/reader/article-api";
import { ArticleReader } from "@/components/article/article-reader";
import { createQueryWrapper, createTestQueryClient } from "../reader/query-wrapper";

vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function detailResponse(overrides: Record<string, unknown> = {}) {
  return Promise.resolve(
    jsonResponse({
      success: true,
      data: {
        id: "a1",
        feedId: "f1",
        feedTitle: "Feed",
        url: "https://example.com/a1",
        title: "Title",
        author: null,
        summary: null,
        contentHtml: "<p>Body</p>",
        contentText: "Body",
        publishedAt: null,
        createdAt: null,
        isRead: false,
        isStarred: false,
        ...overrides,
      },
    }),
  );
}

function patchResponse() {
  return Promise.resolve(jsonResponse({ success: true }));
}

function deferred<T>() {
  return Promise.withResolvers<T>();
}

function readerArticle(
  id: string,
  overrides: Partial<NonNullable<ComponentProps<typeof ArticleReader>["article"]>> = {},
) {
  return {
    id,
    feedTitle: "Feed",
    title: `Article ${id}`,
    author: null,
    url: `https://example.com/${id}`,
    contentHtml: `<p>Original ${id}</p>`,
    contentText: `Original ${id}`,
    publishedAt: null,
    createdAt: null,
    isRead: true,
    isStarred: false,
    tags: [],
    ...overrides,
  };
}

function readerElement(
  article: ComponentProps<typeof ArticleReader>["article"],
  extraProps: Partial<ComponentProps<typeof ArticleReader>> = {},
) {
  return createElement(ArticleReader, {
    article,
    onMarkRead: vi.fn(),
    onStar: vi.fn(),
    ...extraProps,
  });
}

describe("useArticleDetail", () => {
  it("is null when articleId is undefined", () => {
    const { result } = renderHook(() => useArticleDetail(undefined, { markReadOnOpen: false }), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the detail for an articleId", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/articles/a1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("exposes a recoverable error when detail loading fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "文章加载失败" }, false, 500),
    );
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBe("文章加载失败"));
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("retries the current article after a failed detail request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "网络异常" }, false, 500),
    );
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBe("网络异常"));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks an unread article read on open: PATCH + unread-delta event + callback", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: false }));
    fetchMock.mockReturnValueOnce(patchResponse());
    const deltas: UnreadDeltaDetail[] = [];
    const onDelta = (e: Event) => deltas.push((e as CustomEvent<UnreadDeltaDetail>).detail);
    window.addEventListener(UNREAD_DELTA_EVENT, onDelta);
    const onMarkedRead = vi.fn();

    const { result } = renderHook(
      () => useArticleDetail("a1", { markReadOnOpen: true, onMarkedRead }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(onMarkedRead).toHaveBeenCalledWith("a1"));
    expect(result.current.detail?.isRead).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/articles/a1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isRead: true }) }),
    );
    expect(deltas).toEqual([{ feedId: "f1", delta: -1 }]);
    window.removeEventListener(UNREAD_DELTA_EVENT, onDelta);
  });

  it("keeps an article unread when mark-read-on-open persistence fails", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: false }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "write failed" }, false, 500),
    );
    const deltas: UnreadDeltaDetail[] = [];
    const onDelta = (event: Event) => deltas.push((event as CustomEvent<UnreadDeltaDetail>).detail);
    window.addEventListener(UNREAD_DELTA_EVENT, onDelta);
    const onMarkedRead = vi.fn();
    const onMarkReadFailed = vi.fn();

    const { result } = renderHook(
      () => useArticleDetail("a1", { markReadOnOpen: true, onMarkedRead, onMarkReadFailed }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(onMarkReadFailed).toHaveBeenCalledWith("a1"));
    expect(result.current.detail?.isRead).toBe(false);
    expect(onMarkedRead).not.toHaveBeenCalled();
    expect(deltas).toEqual([]);
    window.removeEventListener(UNREAD_DELTA_EVENT, onDelta);
  });

  it("ignores a late auto-read failure after the user switches articles", async () => {
    const patchRequest = deferred<Response>();
    fetchMock.mockReturnValueOnce(detailResponse({ id: "a1", isRead: false }));
    fetchMock.mockReturnValueOnce(patchRequest.promise);
    fetchMock.mockReturnValueOnce(detailResponse({ id: "a2", isRead: true }));
    const onMarkReadFailed = vi.fn();

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useArticleDetail(id, { markReadOnOpen: true, onMarkReadFailed }),
      { initialProps: { id: "a1" }, wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    rerender({ id: "a2" });
    await waitFor(() => expect(result.current.detail?.id).toBe("a2"));

    await act(async () => {
      patchRequest.resolve(jsonResponse({ success: false, error: "late error" }, false, 500));
      await patchRequest.promise;
    });

    expect(onMarkReadFailed).not.toHaveBeenCalled();
  });
});

describe("patchArticle", () => {
  it("rejects with server error when PATCH fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: "Article missing" }, false, 404),
    );
    await expect(patchArticle("a1", { isStarred: true })).rejects.toThrow("Article missing");
  });
});

describe("ArticleReader", () => {
  beforeEach(() => {
    // Default mock for GET /api/articles/[id]/related so unrelated tests stay quiet.
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/related")) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });
  });

  it("uses 44px mobile touch targets on action bar buttons", () => {
    render(readerElement(readerArticle("a1"), { onBack: vi.fn() }), {
      wrapper: createQueryWrapper(),
    });

    for (const name of ["返回文章列表", "标为未读", "收藏文章", "更多操作"]) {
      expect(screen.getByRole("button", { name }).className).toContain("size-11");
    }
  });

  it("toggles between 原文 and 全文 when fullContentHtml exists", () => {
    render(
      readerElement(
        readerArticle("a1", {
          contentHtml: "<p>RSS excerpt</p>",
          fullContentHtml: "<p>Full extracted body</p>",
          fullContentStatus: "ok",
        }),
      ),
      { wrapper: createQueryWrapper() },
    );

    // Defaults to 全文 when fullContentHtml is already present
    expect(screen.getByText("Full extracted body")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "原文" }));
    expect(screen.getByText("RSS excerpt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "全文" }));
    expect(screen.getByText("Full extracted body")).toBeTruthy();
  });

  it("fetches full content on 抓取全文 click and displays failure notice when failed", async () => {
    const client = createTestQueryClient();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/related")) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      if (url.endsWith("/full-content")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { status: "ok", html: "<p>Fetched full text</p>" },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    render(readerElement(readerArticle("a1")), {
      wrapper: createQueryWrapper(client),
    });

    fireEvent.click(screen.getByRole("button", { name: "抓取全文" }));

    expect(await screen.findByText("Fetched full text")).toBeTruthy();
    expect(screen.getByRole("button", { name: "原文" })).toBeTruthy();
  });

  it("shows failure banner when fullContentStatus is failed", () => {
    render(readerElement(readerArticle("a1", { fullContentStatus: "failed" })), {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText(/全文抓取失败/)).toBeTruthy();
  });

  it("renders audio player and YouTube external link without third-party iframes", () => {
    const { container } = render(
      readerElement(
        readerArticle("a1", {
          contentHtml: '<p>Hello</p><iframe src="https://www.youtube.com/embed/abc"></iframe>',
          media: [
            { url: "https://cdn.example.com/ep1.mp3", type: "audio", duration: 125 },
            {
              url: "https://www.youtube.com/watch?v=abc",
              type: "video",
              previewUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
              duration: 90,
            },
          ],
        }),
      ),
      { wrapper: createQueryWrapper() },
    );

    expect(container.querySelector("iframe")).toBeNull();
    const audio = container.querySelector("audio");
    expect(audio?.getAttribute("preload")).toBe("none");
    expect(audio?.getAttribute("src")).toBe("https://cdn.example.com/ep1.mp3");
    expect(screen.getByText("在 YouTube 打开")).toBeTruthy();
  });

  it("renders 相关报道 when related articles exist and hides when empty", async () => {
    const onSelectRelated = vi.fn();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/related")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [
              {
                id: "rel-1",
                title: "Another source covers this",
                url: "https://other.example.com/story",
                feedId: "f2",
                feedTitle: "Other Feed",
                feedIconUrl: null,
                publishedAt: "2026-11-21T00:00:00.000Z",
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    render(readerElement(readerArticle("a1"), { onSelectRelated }), {
      wrapper: createQueryWrapper(),
    });

    expect(await screen.findByText("相关报道")).toBeTruthy();
    fireEvent.click(screen.getByText("Another source covers this"));
    expect(onSelectRelated).toHaveBeenCalledWith("rel-1");
  });

  it("clears a pending summary and drops late responses when the article changes", async () => {
    const request = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/summarize")) return request.promise;
      if (url.endsWith("/related")) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    const { rerender } = render(readerElement(readerArticle("a1")), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "AI 摘要" }));
    expect(await screen.findByText("正在生成摘要…")).toBeTruthy();

    rerender(readerElement(readerArticle("a2")));
    await waitFor(() => expect(screen.queryByText("正在生成摘要…")).toBeNull());

    await act(async () => {
      request.resolve(
        jsonResponse({
          success: true,
          data: { summary: "Summary for a1", importance: null },
        }),
      );
      await request.promise;
    });
    expect(screen.queryByText("Summary for a1")).toBeNull();
  });

  it("drops late tag suggestions from the previous article", async () => {
    const request = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tag-suggestions")) return request.promise;
      if (url.endsWith("/related")) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    const { rerender } = render(readerElement(readerArticle("a1")), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(screen.getByRole("button", { name: "AI 推荐标签" }));
    rerender(readerElement(readerArticle("a2", { tags: [{ id: "b-tag", name: "B tag" }] })));

    await act(async () => {
      request.resolve(
        jsonResponse({
          success: true,
          data: { suggestions: [{ name: "A suggestion", existingTagId: null }] },
        }),
      );
      await request.promise;
    });

    expect(screen.getByText("B tag")).toBeTruthy();
    expect(screen.queryByText("A suggestion")).toBeNull();
  });
});
