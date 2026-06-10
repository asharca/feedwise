// tests/jobs/enrichment-worker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/digest/llm-config", () => ({
  getUsersWithAutoTagEnabled: vi.fn(),
  getUsersWithAutoSummarizeEnabled: vi.fn(),
  getUserLlmConfig: vi.fn(),
}));
vi.mock("@/lib/db/queries/articles", () => ({
  getUntaggedArticlesForUser: vi.fn(),
  getUnsummarizedArticlesForUser: vi.fn(),
  setArticleAiSummary: vi.fn(async () => undefined),
  setArticleImportance: vi.fn(async () => undefined),
  addTagToArticle: vi.fn(async () => ({ tagId: "t1", name: "ai" })),
}));
vi.mock("@/lib/articles/tag-batch", () => ({
  tagUserArticles: vi.fn(),
}));
vi.mock("@/lib/articles/enrichment", () => ({
  generateArticleSummary: vi.fn(),
  generateTagsForArticle: vi.fn(),
}));

import {
  getUsersWithAutoTagEnabled,
  getUsersWithAutoSummarizeEnabled,
  getUserLlmConfig,
} from "@/lib/digest/llm-config";
import {
  getUntaggedArticlesForUser,
  getUnsummarizedArticlesForUser,
  setArticleAiSummary,
  setArticleImportance,
} from "@/lib/db/queries/articles";
import { tagUserArticles } from "@/lib/articles/tag-batch";
import { generateArticleSummary } from "@/lib/articles/enrichment";
import { LlmRateLimitError } from "@/lib/digest/llm-client";
import { runAutoTagging, runAutoSummarizing } from "@/lib/jobs/workers/enrichment-worker";

const llm = {
  enabled: true,
  baseUrl: "https://llm.test/v1",
  apiKey: "k",
  model: "m",
  format: "openai" as const,
  autoSummarize: true,
  autoTag: true,
};

function enrichable(id: string) {
  return { id, title: `T-${id}`, summary: null, aiSummary: null, contentText: "x".repeat(900), contentHtml: null };
}

beforeEach(() => {
  vi.mocked(getUsersWithAutoTagEnabled).mockReset();
  vi.mocked(getUsersWithAutoSummarizeEnabled).mockReset();
  vi.mocked(getUserLlmConfig).mockReset().mockResolvedValue(llm);
  vi.mocked(getUntaggedArticlesForUser).mockReset();
  vi.mocked(getUnsummarizedArticlesForUser).mockReset();
  vi.mocked(tagUserArticles).mockReset();
  vi.mocked(generateArticleSummary).mockReset();
  vi.mocked(setArticleAiSummary).mockClear();
  vi.mocked(setArticleImportance).mockClear();
});

describe("runAutoTagging", () => {
  it("returns zeros when no user has auto-tag on", async () => {
    vi.mocked(getUsersWithAutoTagEnabled).mockResolvedValue([]);
    expect(await runAutoTagging()).toEqual({ users: 0, tagged: 0 });
  });

  it("skips users without a working LLM config", async () => {
    vi.mocked(getUsersWithAutoTagEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUserLlmConfig).mockResolvedValue(null);
    expect(await runAutoTagging()).toEqual({ users: 1, tagged: 0 });
    expect(getUntaggedArticlesForUser).not.toHaveBeenCalled();
  });

  it("delegates each user's untagged batch to tagUserArticles and sums counts", async () => {
    vi.mocked(getUsersWithAutoTagEnabled).mockResolvedValue(["u1", "u2"]);
    vi.mocked(getUntaggedArticlesForUser).mockResolvedValue([enrichable("a1")]);
    vi.mocked(tagUserArticles).mockResolvedValue({ attempted: 1, tagged: 2, failed: 0, rateLimited: false });
    expect(await runAutoTagging()).toEqual({ users: 2, tagged: 4 });
    expect(tagUserArticles).toHaveBeenCalledTimes(2);
  });
});

describe("runAutoSummarizing", () => {
  it("persists summary and importance on success", async () => {
    vi.mocked(getUsersWithAutoSummarizeEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUnsummarizedArticlesForUser).mockResolvedValue([enrichable("a1")]);
    vi.mocked(generateArticleSummary).mockResolvedValue({
      kind: "ok",
      result: { summary: "s", importance: "high" },
    });
    expect(await runAutoSummarizing()).toEqual({ users: 1, summarized: 1 });
    expect(setArticleAiSummary).toHaveBeenCalledWith("a1", "s");
    expect(setArticleImportance).toHaveBeenCalledWith("a1", "high");
  });

  it("stops the user's batch on rate limit but does not throw", async () => {
    vi.mocked(getUsersWithAutoSummarizeEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUnsummarizedArticlesForUser).mockResolvedValue([enrichable("a1"), enrichable("a2")]);
    vi.mocked(generateArticleSummary).mockRejectedValueOnce(new LlmRateLimitError());
    expect(await runAutoSummarizing()).toEqual({ users: 1, summarized: 0 });
    expect(generateArticleSummary).toHaveBeenCalledTimes(1);
  });

  it("continues to the next article on a non-rate-limit error", async () => {
    vi.mocked(getUsersWithAutoSummarizeEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUnsummarizedArticlesForUser).mockResolvedValue([enrichable("a1"), enrichable("a2")]);
    vi.mocked(generateArticleSummary)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ kind: "ok", result: { summary: "s2", importance: null } });
    expect(await runAutoSummarizing()).toEqual({ users: 1, summarized: 1 });
    expect(setArticleAiSummary).toHaveBeenCalledWith("a2", "s2");
  });
});
