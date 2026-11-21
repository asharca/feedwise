import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  formatFetchInterval,
  formatHtmlDisplayUrl,
  getEffectiveView,
  getSourceTypeLabel,
} from "@/components/layout/sidebar/content-view-meta";
import { groupSubscriptionsByFolder } from "@/components/layout/sidebar/use-sidebar-data";
import { FeedSettingsDialog } from "@/components/layout/sidebar/feed-settings-dialog";
import { FeedItem } from "@/components/layout/sidebar/feed-item";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { Folder, Subscription } from "@/components/layout/sidebar/types";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, node));
}

const folders: Folder[] = [
  { id: "folder-1", name: "科技", position: 0 },
  { id: "folder-2", name: "设计", position: 1 },
];

const baseSub: Subscription = {
  id: "sub-1",
  feedId: "feed-1",
  title: "My Feed",
  feedTitle: "Original Feed",
  url: "https://example.com/rss.xml",
  iconUrl: null,
  siteUrl: "https://example.com",
  folderId: "folder-1",
  unreadCount: 3,
  sourceType: "rss",
  view: "picture",
  viewOverride: null,
  defaultView: "picture",
  fetchFullText: false,
  fetchIntervalMinutes: 120,
  nextFetchAt: "2026-11-21T06:00:00.000Z",
  lastFetchError: "连接超时",
  consecutiveFailures: 2,
};

describe("content-view-meta helpers", () => {
  it("computes effective view, labels, intervals, and html display urls", () => {
    expect(getEffectiveView({ view: undefined, viewOverride: null, defaultView: "video" })).toBe(
      "video",
    );
    expect(getEffectiveView({ view: "audio", viewOverride: "audio", defaultView: "article" })).toBe(
      "audio",
    );
    expect(getSourceTypeLabel("rss")).toBe("RSS / Atom");
    expect(getSourceTypeLabel("html")).toBe("网页抓取 (HTML)");
    expect(formatFetchInterval(30)).toBe("每 30 分钟（自适应）");
    expect(formatFetchInterval(120)).toBe("每 2 小时（自适应）");
    expect(formatFetchInterval(1440)).toBe("每 1 天（自适应）");
    expect(formatHtmlDisplayUrl("https://example.com/news#feedwise-html=abcdef123456", null)).toBe(
      "https://example.com/news",
    );
  });

  it("groups subscriptions by folder and computes unread totals", () => {
    const subs: Subscription[] = [
      baseSub,
      { ...baseSub, id: "sub-2", feedId: "feed-2", folderId: null, unreadCount: 5 },
    ];
    const result = groupSubscriptionsByFolder(subs, folders);
    expect(result.totalUnread).toBe(8);
    expect(result.folderGroups[0]?.subs).toHaveLength(1);
    expect(result.folderGroups[0]?.unreadCount).toBe(3);
    expect(result.folderGroups[1]?.subs).toHaveLength(0);
    expect(result.uncategorized).toHaveLength(1);
  });
});

describe("FeedItem view icon", () => {
  const noopActions = {
    onNavigate: vi.fn(),
    onMarkAllRead: vi.fn(),
    onRefresh: vi.fn(),
    onOpenSettings: vi.fn(),
    onMoveToFolder: vi.fn(),
    onDelete: vi.fn(),
  };

  it("shows a view icon when effective view is not article", () => {
    renderWithQuery(
      createElement(
        SidebarProvider,
        null,
        createElement(FeedItem, {
          sub: { ...baseSub, view: "picture", defaultView: "picture" },
          folders,
          isActive: false,
          actions: noopActions,
        }),
      ),
    );
    expect(screen.getByLabelText("显示方式：图片")).toBeTruthy();
  });

  it("omits the view icon for standard article feeds", () => {
    renderWithQuery(
      createElement(
        SidebarProvider,
        null,
        createElement(FeedItem, {
          sub: { ...baseSub, view: "article", viewOverride: null, defaultView: "article" },
          folders,
          isActive: false,
          actions: noopActions,
        }),
      ),
    );
    expect(screen.queryByLabelText(/^显示方式：/)).toBeNull();
  });
});

describe("FeedSettingsDialog", () => {
  it("renders metadata and submits updated view, fetchFullText, title, folder, and rss url", async () => {
    const onOpenChange = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: {} }),
    } as Response);

    renderWithQuery(
      createElement(FeedSettingsDialog, {
        open: true,
        target: baseSub,
        folders,
        onOpenChange,
      }),
    );

    expect(screen.getByText("RSS / Atom")).toBeTruthy();
    expect(screen.getByText("每 2 小时（自适应）")).toBeTruthy();
    expect(screen.getByText(/连接超时/)).toBeTruthy();
    expect(screen.getByRole("option", { name: "自动（图片）" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "新名字" } });
    fireEvent.change(screen.getByLabelText("订阅地址"), {
      target: { value: "https://example.com/new.xml" },
    });
    fireEvent.change(screen.getByLabelText("文件夹"), { target: { value: "folder-2" } });
    fireEvent.change(screen.getByLabelText("显示方式"), { target: { value: "video" } });
    fireEvent.click(screen.getByRole("switch", { name: "自动抓取全文" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feeds/sub-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      customTitle: "新名字",
      feedUrl: "https://example.com/new.xml",
      folderId: "folder-2",
      view: "video",
      fetchFullText: true,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows page URL read-only for HTML sources and does not send feedUrl", async () => {
    const htmlSub: Subscription = {
      ...baseSub,
      sourceType: "html",
      url: "https://news.example.com/#feedwise-html=1234567890ab",
      siteUrl: "https://news.example.com/",
      lastFetchError: null,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: {} }),
    } as Response);

    renderWithQuery(
      createElement(FeedSettingsDialog, {
        open: true,
        target: htmlSub,
        folders,
        onOpenChange: vi.fn(),
      }),
    );

    expect(screen.getByText("网页抓取 (HTML)")).toBeTruthy();
    expect(screen.queryByLabelText("订阅地址")).toBeNull();
    expect(screen.getByText("https://news.example.com/")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("feedUrl");
  });
});
