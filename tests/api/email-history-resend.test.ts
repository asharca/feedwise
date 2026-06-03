// tests/api/email-history-resend.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getArticlesForLog: vi.fn(),
  getDigestLogById: vi.fn(),
  getSubscriptionSettings: vi.fn(),
  getUserSMTPConfig: vi.fn(),
  getUserEmail: vi.fn(),
  logDigestSendWithArticles: vi.fn(),
  assembleDigestForSubscription: vi.fn(),
  sendDailyDigestWithRetry: vi.fn(),
  renderDigestHtml: vi.fn(),
  renderFallbackHtml: vi.fn(),
  buildEmailLinkFn: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/email/queries", () => ({
  getArticlesForLog: mocks.getArticlesForLog,
  getDigestLogById: mocks.getDigestLogById,
  getSubscriptionSettings: mocks.getSubscriptionSettings,
  getUserSMTPConfig: mocks.getUserSMTPConfig,
  getUserEmail: mocks.getUserEmail,
  logDigestSendWithArticles: mocks.logDigestSendWithArticles,
}));
vi.mock("@/lib/jobs/workers/digest-worker", () => ({
  assembleDigestForSubscription: mocks.assembleDigestForSubscription,
  sendDailyDigestWithRetry: mocks.sendDailyDigestWithRetry,
}));
vi.mock("@/lib/email/templates/digest-html", () => ({ renderDigestHtml: mocks.renderDigestHtml }));
vi.mock("@/lib/email/templates/digest-fallback-html", () => ({ renderFallbackHtml: mocks.renderFallbackHtml }));
vi.mock("@/lib/email/click-link", () => ({ buildEmailLinkFn: mocks.buildEmailLinkFn }));

import { POST } from "@/app/api/settings/email/history/[logId]/resend/route";

const LOG_ID = "11111111-1111-4111-a111-000000000001";
const USER_ID = "user-1";
const article = {
  id: "a1", title: "T", url: "u", summary: null, aiSummary: null,
  importance: null, feedTitle: "F", feedId: "f", publishedAt: null, tags: [],
};

function call() {
  return POST(
    new Request(`http://localhost/api/settings/email/history/${LOG_ID}/resend`, { method: "POST" }),
    { params: Promise.resolve({ logId: LOG_ID }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({ user: { id: USER_ID } });
  mocks.getDigestLogById.mockResolvedValue({
    id: LOG_ID, sentAt: new Date(), articleCount: 1, status: "failed", errorMessage: "boom",
  });
  mocks.getArticlesForLog.mockResolvedValue([article]);
  mocks.getUserSMTPConfig.mockResolvedValue({ host: "smtp.test", port: 587, user: "u", pass: "p", from: "f" });
  mocks.getUserEmail.mockResolvedValue("user@example.com");
  mocks.getSubscriptionSettings.mockResolvedValue(null);
  mocks.buildEmailLinkFn.mockReturnValue(((a: { url: string | null }) => a.url ?? "") as never);
  mocks.assembleDigestForSubscription.mockResolvedValue({ digest: { mode: "clustered" } as never, allArticleIds: ["a1"] });
  mocks.renderDigestHtml.mockResolvedValue("<html>x</html>");
  mocks.sendDailyDigestWithRetry.mockResolvedValue(undefined);
  mocks.logDigestSendWithArticles.mockResolvedValue("new-log-id");
});

describe("POST /api/settings/email/history/[logId]/resend", () => {
  it("401 without a session", async () => {
    mocks.requireSession.mockRejectedValue(new Error("no"));
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("400 for an empty article set", async () => {
    mocks.getArticlesForLog.mockResolvedValue([]);
    const res = await call();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Nothing to resend/);
  });

  it("400 when SMTP is not configured", async () => {
    mocks.getUserSMTPConfig.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/SMTP not configured/);
  });

  it("200 + new success log row on happy path", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.sentTo).toBe("user@example.com");
    expect(body.data.articleCount).toBe(1);
    expect(body.data.newLogId).toBe("new-log-id");
    expect(mocks.logDigestSendWithArticles).toHaveBeenCalledWith(
      USER_ID, ["a1"], 1, "success"
    );
  });

  it("500 + new failed log row on SMTP error", async () => {
    mocks.sendDailyDigestWithRetry.mockRejectedValue(new Error("connect ETIMEDOUT"));
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/timed out/);
    expect(mocks.logDigestSendWithArticles).toHaveBeenCalledWith(
      USER_ID, ["a1"], 1, "failed", expect.stringContaining("ETIMEDOUT")
    );
  });
});
