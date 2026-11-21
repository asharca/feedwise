import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsContent } from "@/components/settings/settings-content";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { RulesSection } from "@/components/settings/rules-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { ClientsSection } from "@/components/settings/clients-section";
import { ShareFeedsSection } from "@/components/settings/share-feeds-section";
import { McpSection } from "@/components/settings/mcp-section";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(createElement(QueryClientProvider, { client }, node));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsContent navigation", () => {
  it("lists all settings sections in Chinese and switches sections", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/settings") return jsonResponse({ success: true, data: { theme: "dark" } });
      if (url === "/api/settings/account") {
        return jsonResponse({
          success: true,
          data: {
            id: "u1",
            email: "alice@example.com",
            name: "Alice",
            image: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
        });
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderWithQuery(createElement(SettingsContent, { initialSection: "appearance" }));
    expect(screen.getByRole("button", { name: "规则" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "通知渠道" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "第三方客户端" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "RSS 输出" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "MCP / AI 助手" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "MCP / AI 助手" }));
    await waitFor(() => {
      expect(screen.getAllByText(/\/api\/mcp/).length).toBeGreaterThanOrEqual(2);
    });
  });

  it("focuses the active nav button when SettingsDialog opens on a deep link", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: [] }));

    renderWithQuery(
      createElement(SettingsDialog, {
        open: true,
        onOpenChange: vi.fn(),
        initialSection: "rules",
      }),
    );

    const rulesButton = await screen.findByRole("button", { name: "规则" });
    const appearanceButton = screen.getByRole("button", { name: "外观" });
    expect(rulesButton.getAttribute("aria-current")).toBe("page");

    await waitFor(() => {
      expect(document.activeElement).toBe(rulesButton);
      expect(document.activeElement).not.toBe(appearanceButton);
    });
  });
});

describe("RulesSection", () => {
  it("loads rules, toggles enabled state, and reorders via arrow buttons", async () => {
    const rules = [
      {
        id: "r1",
        name: "AI 推送",
        enabled: true,
        scope: "article",
        matchMode: "all",
        conditions: [{ field: "title", op: "contains", value: "AI" }],
        actions: [{ type: "star" }],
        position: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "r2",
        name: "热榜监控",
        enabled: false,
        scope: "hot",
        matchMode: "any",
        conditions: [{ field: "title", op: "contains", value: "开源" }],
        actions: [{ type: "notify", channelIds: ["c1"] }],
        position: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/rules" && !init?.method) {
        return jsonResponse({ success: true, data: rules });
      }
      if (url === "/api/rules/r1" && init?.method === "PATCH") {
        return jsonResponse({ success: true, data: { ...rules[0], enabled: false } });
      }
      if (url === "/api/rules/reorder" && init?.method === "POST") {
        return jsonResponse({ success: true, data: { ok: true } });
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderWithQuery(createElement(RulesSection));
    await waitFor(() => {
      expect(screen.getByText("AI 推送")).toBeTruthy();
      expect(screen.getByText("热榜监控")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("switch", { name: "启用规则 AI 推送" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rules/r1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "上移规则 热榜监控" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rules/reorder",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ ids: ["r2", "r1"] }),
        }),
      );
    });
  });
});

describe("NotificationsSection", () => {
  it("shows configured secret placeholder on edit and explains VAPID setup on 503", async () => {
    // Stub push APIs so the enable-push button renders in jsdom.
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(null),
        register: vi.fn(),
        ready: Promise.resolve({}),
      },
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/notification-channels" && !init?.method) {
        return jsonResponse({
          success: true,
          data: [
            {
              id: "c1",
              type: "telegram",
              name: "个人 TG",
              enabled: true,
              config: { botToken: "", chatId: "999" },
              configuredSecrets: ["botToken"],
              lastError: "401 Unauthorized",
              lastSentAt: null,
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        });
      }
      if (url === "/api/push/vapid-public-key") {
        return jsonResponse({ success: false, error: "Web Push 未配置" }, 503);
      }
      if (url === "/api/notification-channels/c1/test" && init?.method === "POST") {
        return jsonResponse({ success: true, data: { ok: true } });
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderWithQuery(createElement(NotificationsSection));
    await waitFor(() => {
      expect(screen.getByText("个人 TG")).toBeTruthy();
      expect(screen.getByText(/401 Unauthorized/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "在此设备启用浏览器推送" }));
    await waitFor(() => {
      expect(screen.getByText(/VAPID_PUBLIC_KEY/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "编辑渠道 个人 TG" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("已设置，留空保持不变")).toBeTruthy();
    });
  });
});

describe("ClientsSection, ShareFeedsSection, and McpSection", () => {
  it("loads API access endpoints and updates password via PUT", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/settings/api-access" && !init?.method) {
        return jsonResponse({
          success: true,
          data: {
            configured: false,
            username: "reader@example.com",
            greaderUrl: "https://feed.test/api/greader",
            feverUrl: "https://feed.test/api/fever",
          },
        });
      }
      if (url === "/api/settings/api-access" && init?.method === "PUT") {
        return jsonResponse({
          success: true,
          data: {
            configured: true,
            username: "reader@example.com",
            greaderUrl: "https://feed.test/api/greader",
            feverUrl: "https://feed.test/api/fever",
          },
        });
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderWithQuery(createElement(ClientsSection));
    await waitFor(() => {
      expect(screen.getByText("https://feed.test/api/greader")).toBeTruthy();
      expect(screen.getByText("https://feed.test/api/fever")).toBeTruthy();
      expect(screen.getByText(/Reeder/)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText(/新 API 密码/), { target: { value: "secret1234" } });
    fireEvent.click(screen.getByRole("button", { name: "启用 API 访问" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/api-access",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ password: "secret1234" }),
        }),
      );
      expect(screen.getByText("已启用")).toBeTruthy();
    });
  });

  it("loads share feeds and displays filter summary", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/share-feeds") {
        return jsonResponse({
          success: true,
          data: [
            {
              id: "sf1",
              name: "加星精选",
              filter: { starred: true, view: "article" },
              url: "https://feed.test/api/public/rss/tok123",
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderWithQuery(createElement(ShareFeedsSection));
    await waitFor(() => {
      expect(screen.getByText("加星精选")).toBeTruthy();
      expect(screen.getByText("仅加星")).toBeTruthy();
      expect(screen.getByText("视图：文章")).toBeTruthy();
      expect(screen.getByText("https://feed.test/api/public/rss/tok123")).toBeTruthy();
    });
  });

  it("renders MCP endpoint and stdio command with account email", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/settings/account") {
        return jsonResponse({
          success: true,
          data: {
            id: "u1",
            email: "dev@example.com",
            name: "Dev",
            image: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
        });
      }
      return jsonResponse({ success: true, data: [] });
    });

    renderWithQuery(createElement(McpSection));
    await waitFor(() => {
      expect(screen.getByText("FEEDWISE_USER_EMAIL=dev@example.com pnpm mcp")).toBeTruthy();
    });
  });
});
