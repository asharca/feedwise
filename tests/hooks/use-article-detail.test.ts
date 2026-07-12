import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ComponentProps } from "react";
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
import { mergeUniqueArticles, patchArticle } from "@/lib/reader/article-api";
import { ArticleReader } from "@/components/article/article-reader";

vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => cleanup());

function detailResponse(overrides: Record<string, unknown> = {}) {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          id: "a1",
          feedId: "f1",
          feedTitle: "Feed",
          url: "https://e.com/1",
          title: "T",
          author: null,
          summary: null,
          contentHtml: null,
          contentText: null,
          publishedAt: null,
          createdAt: null,
          isRead: false,
          isStarred: false,
          ...overrides,
        },
      }),
  } as Response);
}

function patchResponse() {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function readerArticle(id: string, tags: Array<{ id: string; name: string }> = []) {
  return {
    id,
    feedTitle: "Feed",
    title: `Article ${id}`,
    author: null,
    url: null,
    contentHtml: "<p>Body</p>",
    contentText: "Body",
    publishedAt: null,
    createdAt: null,
    isRead: true,
    isStarred: false,
    tags,
  };
}

function readerElement(article: ComponentProps<typeof ArticleReader>["article"]) {
  return createElement(ArticleReader, {
    article,
    onMarkRead: vi.fn(),
    onStar: vi.fn(),
  });
}

describe("useArticleDetail", () => {
  it("is null when articleId is undefined", () => {
    const { result } = renderHook(() => useArticleDetail(undefined, { markReadOnOpen: false }));
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the detail for an articleId", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/articles/a1");
  });

  it("exposes a recoverable error when detail loading fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));

    await waitFor(() => expect(result.current.error).toBe("Failed to load article"));
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("retries the current article after a failed detail request", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));

    await waitFor(() => expect(result.current.error).toBe("Failed to load article"));
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
    const { result } = renderHook(() =>
      useArticleDetail("a1", { markReadOnOpen: true, onMarkedRead }),
    );
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
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
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ success: false, error: "write failed" }),
    } as Response);
    const deltas: UnreadDeltaDetail[] = [];
    const onDelta = (event: Event) => deltas.push((event as CustomEvent<UnreadDeltaDetail>).detail);
    window.addEventListener(UNREAD_DELTA_EVENT, onDelta);
    const onMarkedRead = vi.fn();
    const onMarkReadFailed = vi.fn();

    const { result } = renderHook(() =>
      useArticleDetail("a1", { markReadOnOpen: true, onMarkedRead, onMarkReadFailed }),
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
    const deltas: UnreadDeltaDetail[] = [];
    const onDelta = (event: Event) => deltas.push((event as CustomEvent<UnreadDeltaDetail>).detail);
    window.addEventListener(UNREAD_DELTA_EVENT, onDelta);
    const onMarkedRead = vi.fn();
    const onMarkReadFailed = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useArticleDetail(id, { markReadOnOpen: true, onMarkedRead, onMarkReadFailed }),
      { initialProps: { id: "a1" } },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(true);
    rerender({ id: "a2" });
    await waitFor(() => expect(result.current.detail?.id).toBe("a2"));

    await act(async () => {
      patchRequest.resolve({
        ok: false,
        json: () => Promise.resolve({ success: false }),
      } as Response);
      await patchRequest.promise;
    });

    expect(result.current.detail?.id).toBe("a2");
    expect(onMarkedRead).not.toHaveBeenCalled();
    expect(onMarkReadFailed).not.toHaveBeenCalled();
    expect(deltas).toEqual([]);
    window.removeEventListener(UNREAD_DELTA_EVENT, onDelta);
  });

  it("does NOT mark read when markReadOnOpen is false", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: false }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(fetchMock).toHaveBeenCalledTimes(1); // detail fetch only, no PATCH
  });

  it("does NOT mark an already-read article again", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: true }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the detail when articleId becomes undefined", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) => useArticleDetail(id, { markReadOnOpen: false }),
      { initialProps: { id: "a1" as string | undefined } },
    );
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    rerender({ id: undefined });
    expect(result.current.detail).toBeNull();
  });

  it("does not expose the previous article while the next detail is loading", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ id: "a1", isRead: true }));
    let resolveSecond!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveSecond = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useArticleDetail(id, { markReadOnOpen: false }),
      { initialProps: { id: "a1" } },
    );
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));

    rerender({ id: "a2" });
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(true);

    resolveSecond(await detailResponse({ id: "a2", isRead: true }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a2"));
  });

  it("exposes setDetail so callers can apply optimistic updates", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    act(() => {
      result.current.setDetail((prev) => (prev ? { ...prev, isStarred: true } : prev));
    });
    expect(result.current.detail?.isStarred).toBe(true);
  });
});

describe("mergeUniqueArticles", () => {
  it("deduplicates both the first page and later pages while keeping server order", () => {
    const first = mergeUniqueArticles(
      [],
      [
        { id: "a1", title: "one" },
        { id: "a1", title: "duplicate one" },
        { id: "a2", title: "two" },
      ],
    );
    expect(first).toEqual([
      { id: "a1", title: "one" },
      { id: "a2", title: "two" },
    ]);

    expect(
      mergeUniqueArticles(first, [
        { id: "a2", title: "duplicate two" },
        { id: "a3", title: "three" },
      ]),
    ).toEqual([
      { id: "a1", title: "one" },
      { id: "a2", title: "two" },
      { id: "a3", title: "three" },
    ]);
  });
});

describe("patchArticle", () => {
  it("rejects an unsuccessful write so optimistic callers can roll back", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ success: false, error: "write failed" }),
    } as Response);

    await expect(patchArticle("a1", { isStarred: true })).rejects.toThrow("write failed");
  });
});

describe("ArticleReader request ownership", () => {
  it("keeps named 44px primary actions in the article toolbar", () => {
    render(
      createElement(ArticleReader, {
        article: readerArticle("a1"),
        onMarkRead: vi.fn(),
        onStar: vi.fn(),
        onBack: vi.fn(),
      }),
    );

    for (const name of [
      "Back to article list",
      "Mark unread",
      "Star article",
      "More article actions",
    ]) {
      expect(screen.getByRole("button", { name }).className).toContain("size-11");
    }
  });

  it("exposes secondary article actions from the More menu", async () => {
    render(
      readerElement({
        ...readerArticle("a1"),
        url: "https://example.com/article",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "More article actions" }));

    for (const name of [
      "Copy link",
      "Open original",
      "Summarise with AI",
      "Suggest tags with AI",
    ]) {
      expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
    }
  });

  it("clears a pending summary when the displayed article changes", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValueOnce(request.promise);
    const { rerender } = render(readerElement(readerArticle("a1")));

    fireEvent.click(screen.getByRole("button", { name: "Summarise with AI" }));
    expect(screen.getByText("Summarising…")).toBeTruthy();

    rerender(readerElement(readerArticle("a2")));
    await waitFor(() => expect(screen.queryByText("Summarising…")).toBeNull());

    await act(async () => {
      request.resolve({
        json: () =>
          Promise.resolve({
            success: true,
            data: { summary: "Summary for a1", importance: null },
          }),
      } as Response);
      await request.promise;
    });
    expect(screen.queryByText("Summary for a1")).toBeNull();
  });

  it("drops late tag suggestions from the previous article", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValueOnce(request.promise);
    const { rerender } = render(readerElement(readerArticle("a1")));

    fireEvent.click(screen.getByRole("button", { name: "Suggest tags with AI" }));
    rerender(readerElement(readerArticle("a2", [{ id: "b-tag", name: "B tag" }])));

    await act(async () => {
      request.resolve({
        json: () =>
          Promise.resolve({
            success: true,
            data: { suggestions: [{ name: "A suggestion", existingTagId: null }] },
          }),
      } as Response);
      await request.promise;
    });

    expect(screen.getByText("B tag")).toBeTruthy();
    expect(screen.queryByText("A suggestion")).toBeNull();
  });

  it("does not add a late accepted tag to the next article's local state", async () => {
    fetchMock.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: { suggestions: [{ name: "A suggestion", existingTagId: null }] },
        }),
    } as Response);
    const acceptRequest = deferred<Response>();
    fetchMock.mockReturnValueOnce(acceptRequest.promise);
    const { rerender } = render(readerElement(readerArticle("a1")));

    fireEvent.click(screen.getByRole("button", { name: "Suggest tags with AI" }));
    const suggestion = await screen.findByRole("button", { name: /A suggestion/ });
    fireEvent.click(suggestion);
    rerender(readerElement(readerArticle("a2", [{ id: "b-tag", name: "B tag" }])));

    await act(async () => {
      acceptRequest.resolve({
        json: () =>
          Promise.resolve({
            success: true,
            data: { tagId: "a-tag", name: "A suggestion" },
          }),
      } as Response);
      await acceptRequest.promise;
    });

    expect(screen.getByText("B tag")).toBeTruthy();
    expect(screen.queryByText("A suggestion")).toBeNull();
  });

  it("does not restore removed tags into a different article after a late failure", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValueOnce(request.promise);
    const { rerender } = render(
      readerElement(readerArticle("a1", [{ id: "a-tag", name: "A tag" }])),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove tag" }));
    rerender(readerElement(readerArticle("a2", [{ id: "b-tag", name: "B tag" }])));

    await act(async () => {
      request.resolve({
        json: () => Promise.resolve({ success: false, error: "Delete failed" }),
      } as Response);
      await request.promise;
    });

    expect(screen.getByText("B tag")).toBeTruthy();
    expect(screen.queryByText("A tag")).toBeNull();
  });
});
