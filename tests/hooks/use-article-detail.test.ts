import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { UNREAD_DELTA_EVENT, type UnreadDeltaDetail } from "@/lib/reader/events";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

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

describe("useArticleDetail", () => {
  it("is null when articleId is undefined", () => {
    const { result } = renderHook(() => useArticleDetail(undefined, { markReadOnOpen: false }));
    expect(result.current.detail).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the detail for an articleId", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/articles/a1");
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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/articles/a1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isRead: true }) }),
    );
    expect(deltas).toEqual([{ feedId: "f1", delta: -1 }]);
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

  it("exposes setDetail so callers can apply optimistic updates", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    const { act } = await import("@testing-library/react");
    act(() => {
      result.current.setDetail((prev) => (prev ? { ...prev, isStarred: true } : prev));
    });
    expect(result.current.detail?.isStarred).toBe(true);
  });
});
