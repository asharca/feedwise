// tests/jobs/digest-orchestration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/email/subscription-settings", () => ({
  getAllActiveSubscriptions: vi.fn(),
  getUserEmail: vi.fn(),
  updateNextScheduledAt: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email/digest-articles", () => ({
  getArticlesForEmail: vi.fn(),
}));
vi.mock("@/lib/email/digest-log", () => ({
  getLastDigestSentDate: vi.fn(),
  recordDigestSent: vi.fn(async () => "log-1"),
  logDigestSendWithArticles: vi.fn(async () => "log-1"),
}));
vi.mock("@/lib/email/sender", () => ({
  sendDailyDigest: vi.fn(async () => undefined),
}));
vi.mock("@/lib/digest/tag-gate", () => ({
  ensureArticlesTagged: vi.fn(async () => ({ status: "ready", retagged: false })),
}));

import { getAllActiveSubscriptions, getUserEmail } from "@/lib/email/subscription-settings";
import { getArticlesForEmail } from "@/lib/email/digest-articles";
import { getLastDigestSentDate, recordDigestSent, logDigestSendWithArticles } from "@/lib/email/digest-log";
import { sendDailyDigest } from "@/lib/email/sender";
import { ensureArticlesTagged } from "@/lib/digest/tag-gate";
import { processDailyDigests } from "@/lib/jobs/workers/digest-worker";

const SUB = {
  id: "sub-1",
  userId: "user-1",
  sendTime: "08:00",
  frequency: "daily" as const,
  cronExpression: "0 * * * *", // hourly, keeps trigger math timezone-proof
  nextScheduledAt: null,
  lastSentAt: null,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpPass: null,
  smtpFrom: null,
  autoSaveOnClick: false,
  markReadOnClick: true,
};

function digestArticle(id: string) {
  return {
    id,
    title: `T-${id}`,
    url: `https://e.com/${id}`,
    summary: null,
    aiSummary: null,
    importance: null,
    feedTitle: "f",
    feedId: "feed-1",
    publishedAt: new Date(),
    tags: [{ id: "t1", name: "ai" }],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // 12:30 local: exactly one hourly trigger (12:00) since lastSent 11:29.
  vi.setSystemTime(new Date(2026, 5, 10, 12, 30, 0));
  vi.mocked(getAllActiveSubscriptions).mockResolvedValue([SUB]);
  vi.mocked(getUserEmail).mockResolvedValue("u@example.com");
  vi.mocked(getLastDigestSentDate).mockResolvedValue(new Date(2026, 5, 10, 11, 29, 0));
  vi.mocked(getArticlesForEmail).mockClear().mockResolvedValue([digestArticle("a1")]);
  vi.mocked(ensureArticlesTagged).mockClear().mockResolvedValue({ status: "ready", retagged: false });
  vi.mocked(sendDailyDigest).mockClear().mockResolvedValue(undefined);
  vi.mocked(recordDigestSent).mockClear().mockResolvedValue("log-1");
  vi.mocked(logDigestSendWithArticles).mockClear().mockResolvedValue("log-1");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("processDailyDigests orchestration", () => {
  it("sends one digest for one missed trigger and records it atomically", async () => {
    await processDailyDigests();
    expect(sendDailyDigest).toHaveBeenCalledTimes(1);
    expect(recordDigestSent).toHaveBeenCalledWith("user-1", ["a1"], 1);
    expect(logDigestSendWithArticles).not.toHaveBeenCalled(); // no failure log
  });

  it("logs a failed send and does NOT record articles as sent", async () => {
    vi.mocked(sendDailyDigest).mockRejectedValue(new Error("smtp down"));
    const run = processDailyDigests();
    await vi.advanceTimersByTimeAsync(60_000); // burn through retry backoff
    await run;
    expect(recordDigestSent).not.toHaveBeenCalled();
    expect(logDigestSendWithArticles).toHaveBeenCalledWith(
      "user-1",
      ["a1"],
      1,
      "failed",
      "smtp down",
    );
  });

  it("postponed gate: no send, no logs, later windows not attempted", async () => {
    // Two missed triggers: 11:00 and 12:00.
    vi.mocked(getLastDigestSentDate).mockResolvedValue(new Date(2026, 5, 10, 10, 29, 0));
    vi.mocked(ensureArticlesTagged).mockResolvedValue({
      status: "postponed",
      reason: "tagging incomplete: rate-limited",
    });
    await processDailyDigests();
    expect(sendDailyDigest).not.toHaveBeenCalled();
    expect(recordDigestSent).not.toHaveBeenCalled();
    expect(logDigestSendWithArticles).not.toHaveBeenCalled();
    expect(getArticlesForEmail).toHaveBeenCalledTimes(1); // only first window tried
  });

  it("re-fetches articles when the gate tagged inline", async () => {
    vi.mocked(ensureArticlesTagged).mockResolvedValue({ status: "ready", retagged: true });
    await processDailyDigests();
    expect(getArticlesForEmail).toHaveBeenCalledTimes(2);
    expect(sendDailyDigest).toHaveBeenCalledTimes(1);
  });
});
