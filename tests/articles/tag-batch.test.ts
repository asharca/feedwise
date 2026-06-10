// tests/articles/tag-batch.test.ts
import { describe, it, expect, vi } from "vitest";
import { tagUserArticles, type TaggableArticle, type TagBatchDeps } from "@/lib/articles/tag-batch";
import { LlmRateLimitError } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/digest/llm-config";

const llmConfig: LlmConfig = {
  enabled: true,
  baseUrl: "https://llm.test/v1",
  apiKey: "k",
  model: "m",
  format: "openai",
  autoSummarize: false,
  autoTag: true,
};

function art(id: string): TaggableArticle {
  return { id, title: `T-${id}`, summary: null, aiSummary: null, contentText: null, contentHtml: null };
}

function deps(overrides: Partial<TagBatchDeps> = {}): TagBatchDeps {
  return {
    generateTags: vi.fn(async () => [{ name: "ai", existingTagId: null }]),
    addTag: vi.fn(async () => ({ tagId: "t1", name: "ai" })),
    getUserTags: vi.fn(async () => [{ id: "t1", name: "ai" }]),
    ...overrides,
  };
}

describe("tagUserArticles", () => {
  it("tags every article and reports counts", async () => {
    const d = deps();
    const result = await tagUserArticles("u1", [art("a1"), art("a2")], llmConfig, d);
    expect(result).toEqual({ attempted: 2, tagged: 2, failed: 0, rateLimited: false });
    expect(d.addTag).toHaveBeenCalledTimes(2);
  });

  it("an LLM attempt returning no tags still counts as attempted", async () => {
    const d = deps({ generateTags: vi.fn(async () => []) });
    const result = await tagUserArticles("u1", [art("a1")], llmConfig, d);
    expect(result).toEqual({ attempted: 1, tagged: 0, failed: 0, rateLimited: false });
  });

  it("stops the batch on rate limit and reports it", async () => {
    const generateTags = vi
      .fn(async () => [{ name: "ai", existingTagId: null }])
      .mockImplementationOnce(async () => [{ name: "ai", existingTagId: null }])
      .mockImplementationOnce(async () => {
        throw new LlmRateLimitError();
      });
    const d = deps({ generateTags });
    const result = await tagUserArticles("u1", [art("a1"), art("a2"), art("a3")], llmConfig, d);
    expect(result.rateLimited).toBe(true);
    expect(result.attempted).toBe(1);
    expect(generateTags).toHaveBeenCalledTimes(2); // a3 never attempted
  });

  it("counts non-rate-limit LLM failures and continues with next article", async () => {
    const generateTags = vi
      .fn(async () => [{ name: "ai", existingTagId: null }])
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      });
    const d = deps({ generateTags });
    const result = await tagUserArticles("u1", [art("a1"), art("a2")], llmConfig, d);
    expect(result).toEqual({ attempted: 1, tagged: 1, failed: 1, rateLimited: false });
  });

  it("returns zeros for an empty batch without fetching user tags", async () => {
    const d = deps();
    const result = await tagUserArticles("u1", [], llmConfig, d);
    expect(result).toEqual({ attempted: 0, tagged: 0, failed: 0, rateLimited: false });
    expect(d.getUserTags).not.toHaveBeenCalled();
  });
});
