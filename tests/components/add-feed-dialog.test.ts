import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddFeedDialog, buildHtmlSourceConfig } from "@/components/layout/sidebar/add-feed-dialog";
import { buildSearchParams } from "@/lib/hooks/use-search";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, node));
}

describe("buildHtmlSourceConfig", () => {
  it("trims selectors and omits empty optional fields", () => {
    expect(
      buildHtmlSourceConfig({
        item: "  article.post ",
        title: " h2 a ",
        link: "   ",
        content: " p.desc ",
        date: "",
        image: " img ",
      }),
    ).toEqual({
      item: "article.post",
      title: "h2 a",
      content: "p.desc",
      image: "img",
    });
  });
});

describe("buildSearchParams", () => {
  it("serializes active search filters without empty params", () => {
    const params = buildSearchParams(
      "人工智能",
      {
        feedId: "f-1",
        folderId: undefined,
        tagId: "t-1",
        unread: true,
        starred: false,
        since: "7d",
      },
      Date.UTC(2026, 10, 21, 0, 0, 0),
    );
    expect(params.get("q")).toBe("人工智能");
    expect(params.get("feedId")).toBe("f-1");
    expect(params.get("folderId")).toBeNull();
    expect(params.get("tag")).toBe("t-1");
    expect(params.get("unread")).toBe("true");
    expect(params.get("starred")).toBeNull();
    expect(params.get("since")).toBe("2026-11-14T00:00:00.000Z");
  });
});

describe("AddFeedDialog HTML scraper tab", () => {
  it("previews HTML items and submits an HTML source subscription", async () => {
    const onOpenChange = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              title: "Tech News",
              items: [
                {
                  title: "First scraped story",
                  url: "https://example.com/1",
                  summary: "Preview summary",
                  publishedAt: "2026-11-20T00:00:00.000Z",
                  imageUrl: null,
                },
              ],
            },
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              added: 1,
              failed: 0,
              results: [{ url: "https://example.com/news", feedId: "f-1" }],
            },
          }),
      } as Response);

    renderWithQuery(createElement(AddFeedDialog, { open: true, onOpenChange }));

    fireEvent.click(screen.getByRole("tab", { name: "网页抓取" }));

    fireEvent.change(screen.getByLabelText("网页地址 *"), {
      target: { value: "https://example.com/news" },
    });
    fireEvent.change(screen.getByLabelText("条目选择器 (item) *"), {
      target: { value: "article.post" },
    });
    fireEvent.change(screen.getByLabelText("标题选择器 (title) *"), {
      target: { value: "h2 a" },
    });

    fireEvent.click(screen.getByRole("button", { name: "预览" }));

    expect(await screen.findByText("First scraped story")).toBeTruthy();
    expect(screen.getByText("Tech News")).toBeTruthy();

    const [previewUrl, previewInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(previewUrl).toBe("/api/feeds/preview-html");
    expect(JSON.parse(previewInit.body as string)).toEqual({
      url: "https://example.com/news",
      config: { item: "article.post", title: "h2 a" },
    });

    fireEvent.click(screen.getByRole("button", { name: "订阅" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [subUrl, subInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(subUrl).toBe("/api/feeds");
    expect(JSON.parse(subInit.body as string)).toEqual({
      url: "https://example.com/news",
      source: {
        type: "html",
        config: { item: "article.post", title: "h2 a" },
      },
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
