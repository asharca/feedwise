import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChartsPanel } from "@/components/dashboard/charts-panel";
import { NewsDashboard } from "@/components/dashboard/news-dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/motion/card-enter", () => ({
  CardEnter: ({ children }: { children: ReactNode }) => children,
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
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(createElement(QueryClientProvider, { client }, node));
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const groupedPayload = {
  success: true,
  data: [
    {
      folderId: null,
      folderName: "Uncategorized",
      articles: [
        {
          id: "article-1",
          feedTitle: "Example feed",
          feedIconUrl: null,
          title: "Available article",
          summary: "Still visible when stats fail",
          imageUrl: null,
          publishedAt: "2026-07-12T00:00:00.000Z",
          createdAt: "2026-07-12T00:00:00.000Z",
          isRead: false,
          isStarred: false,
          importance: "high",
          folderId: null,
          folderName: null,
        },
      ],
    },
  ],
};

const statsPayload = {
  success: true,
  data: {
    subscriptions: 2,
    failingFeeds: 0,
    unread: 4,
    newToday: 1,
    readThisWeek: 3,
    tags: 2,
  },
};

describe("NewsDashboard resource failures", () => {
  it("keeps article groups visible and retries only stats when stats fail", async () => {
    let statsAttempts = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/articles/grouped") {
        return Promise.resolve(jsonResponse(groupedPayload));
      }
      if (url === "/api/dashboard/stats") {
        statsAttempts += 1;
        return Promise.resolve(
          statsAttempts === 1
            ? jsonResponse({ success: false, error: "stats unavailable" }, false, 500)
            : jsonResponse(statsPayload),
        );
      }
      if (url === "/api/dashboard/timeline?days=7") {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              days: ["2026-07-12"],
              newPerDay: [0],
              readsPerDay: [0],
              tagActivity: [],
            },
          }),
        );
      }
      if (url === "/api/hot/trending") {
        return Promise.resolve(
          jsonResponse({ success: true, data: { crossPlatform: [], rising: [] } }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderWithQuery(createElement(NewsDashboard, { onSelectArticle: vi.fn() }));

    expect(await screen.findByText("Available article")).toBeTruthy();
    expect(screen.queryByText("Dashboard unavailable")).toBeNull();
    expect(screen.getByText("阅读统计暂不可用")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重试统计" }));

    await waitFor(() => expect(screen.getByText("未读")).toBeTruthy());
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/articles/grouped")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/dashboard/stats")).toHaveLength(2);
  });
});

describe("ChartsPanel request failures", () => {
  it("replaces the initial spinner with a retryable error state", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          days: ["2026-07-12"],
          newPerDay: [0],
          readsPerDay: [0],
          tagActivity: [],
        },
      }),
    );

    renderWithQuery(createElement(ChartsPanel));

    expect(await screen.findByText("Activity unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Loading activity")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry activity" }));

    expect(await screen.findByText("No activity in this range")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
