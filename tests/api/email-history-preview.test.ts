// tests/api/email-history-preview.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/email/digest-log", () => ({
  getArticlesForLog: vi.fn(),
  getDigestLogById: vi.fn(),
}));
vi.mock("@/lib/email/subscription-settings", () => ({
  getSubscriptionSettings: vi.fn(),
}));
vi.mock("@/lib/jobs/workers/digest-worker", () => ({
  assembleDigestForSubscription: vi.fn(),
}));
vi.mock("@/lib/email/templates/digest-html", () => ({ renderDigestHtml: vi.fn() }));
vi.mock("@/lib/email/templates/digest-fallback-html", () => ({ renderFallbackHtml: vi.fn() }));
vi.mock("@/lib/email/click-link", () => ({ buildEmailLinkFn: vi.fn() }));

import { requireSession } from "@/lib/auth/session";
import { getArticlesForLog, getDigestLogById } from "@/lib/email/digest-log";
import { getSubscriptionSettings } from "@/lib/email/subscription-settings";
import { assembleDigestForSubscription } from "@/lib/jobs/workers/digest-worker";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import { buildEmailLinkFn } from "@/lib/email/click-link";
import { GET } from "@/app/api/settings/email/history/[logId]/preview/route";

const LOG_ID = "11111111-1111-4111-a111-000000000001";
const USER_ID = "user-1";

function call() {
  return GET(new Request(`http://localhost/api/settings/email/history/${LOG_ID}/preview`), {
    params: Promise.resolve({ logId: LOG_ID }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({ user: { id: USER_ID } });
  vi.mocked(getSubscriptionSettings).mockResolvedValue(null);
  vi.mocked(buildEmailLinkFn).mockReturnValue(
    ((a: { url: string | null }) => a.url ?? "") as never,
  );
});

describe("GET /api/settings/email/history/[logId]/preview", () => {
  it("401 without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("no"));
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("400 for an invalid logId", async () => {
    const res = await GET(new Request("http://localhost/api/.../preview"), {
      params: Promise.resolve({ logId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("404 when the log is missing or not owned", async () => {
    vi.mocked(getDigestLogById).mockResolvedValue(null as never);
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("200 with empty-state HTML for a log with no articles", async () => {
    vi.mocked(getDigestLogById).mockResolvedValue({
      id: LOG_ID,
      sentAt: new Date("2026-06-03"),
      articleCount: 0,
      status: "success",
      errorMessage: null,
    });
    vi.mocked(getArticlesForLog).mockResolvedValue([]);
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.articleCount).toBe(0);
    expect(body.data.html).toMatch(/No articles/);
  });

  it("200 with clustered render when mode is clustered", async () => {
    vi.mocked(getDigestLogById).mockResolvedValue({
      id: LOG_ID,
      sentAt: new Date("2026-06-03"),
      articleCount: 2,
      status: "success",
      errorMessage: null,
    });
    vi.mocked(getArticlesForLog).mockResolvedValue([
      {
        id: "a1",
        title: "T",
        url: "u",
        summary: null,
        aiSummary: null,
        importance: null,
        feedTitle: "F",
        feedId: "f",
        publishedAt: null,
        tags: [],
      },
    ]);
    vi.mocked(assembleDigestForSubscription).mockResolvedValue({
      digest: { mode: "clustered" } as never,
      allArticleIds: ["a1"],
    });
    vi.mocked(renderDigestHtml).mockResolvedValue("<html>clustered</html>");
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.html).toBe("<html>clustered</html>");
    expect(body.data.mode).toBe("clustered");
  });

  it("200 with fallback render when mode is fallback", async () => {
    vi.mocked(getDigestLogById).mockResolvedValue({
      id: LOG_ID,
      sentAt: new Date("2026-06-03"),
      articleCount: 1,
      status: "failed",
      errorMessage: "boom",
    });
    vi.mocked(getArticlesForLog).mockResolvedValue([
      {
        id: "a1",
        title: "T",
        url: "u",
        summary: null,
        aiSummary: null,
        importance: null,
        feedTitle: "F",
        feedId: "f",
        publishedAt: null,
        tags: [],
      },
    ]);
    vi.mocked(assembleDigestForSubscription).mockResolvedValue({
      digest: { mode: "fallback" } as never,
      allArticleIds: ["a1"],
    });
    vi.mocked(renderFallbackHtml).mockResolvedValue("<html>fallback</html>");
    const res = await call();
    const body = await res.json();
    expect(body.data.html).toBe("<html>fallback</html>");
    expect(body.data.status).toBe("failed");
  });
});
