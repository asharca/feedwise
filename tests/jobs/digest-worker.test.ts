import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/queries", () => ({
  getUserLlmConfig: vi.fn(),
}));
vi.mock("@/lib/digest/cluster", () => ({
  runClustering: vi.fn(),
}));

import { assembleDigestForSubscription } from "@/lib/jobs/workers/digest-worker";
import type { DigestArticle } from "@/lib/digest/types";
import { getUserLlmConfig } from "@/lib/email/queries";
import { runClustering } from "@/lib/digest/cluster";

function art(n: number): DigestArticle {
  return {
    id: `f47ac10b-58cc-4372-a567-${String(n).padStart(12, "0")}`,
    title: `T-${n}`,
    url: `https://e.com/${n}`,
    summary: null,
    feedTitle: "f",
    publishedAt: new Date(),
  };
}

describe("assembleDigestForSubscription", () => {
  beforeEach(() => {
    vi.mocked(getUserLlmConfig).mockReset();
    vi.mocked(runClustering).mockReset();
  });

  it("when LLM disabled, returns fallback (no-config) and never calls runClustering", async () => {
    vi.mocked(getUserLlmConfig).mockResolvedValue(null);
    const articles = [art(1), art(2)];
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.mode).toBe("fallback-no-config");
    expect(runClustering).not.toHaveBeenCalled();
    expect(out.allArticleIds.sort()).toEqual(articles.map((a) => a.id).sort());
  });

  it("when LLM enabled and succeeds, returns clustered digest", async () => {
    vi.mocked(getUserLlmConfig).mockResolvedValue({
      enabled: true,
      baseUrl: "https://api.x",
      apiKey: "sk",
      model: "m",
      format: "openai",
    });
    const articles = [art(1), art(2)];
    vi.mocked(runClustering).mockResolvedValue({
      clusters: [
        {
          topic: "AI",
          headline: "h",
          importance: 8,
          articleIds: articles.map((a) => a.id),
        },
      ],
    });
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.mode).toBe("clustered");
    expect(out.allArticleIds.sort()).toEqual(articles.map((a) => a.id).sort());
  });

  it("when LLM fails, returns fallback (llm-failed)", async () => {
    vi.mocked(getUserLlmConfig).mockResolvedValue({
      enabled: true,
      baseUrl: "https://api.x",
      apiKey: "sk",
      model: "m",
      format: "openai",
    });
    vi.mocked(runClustering).mockRejectedValue(new Error("boom"));
    const articles = [art(1)];
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.mode).toBe("fallback-llm-failed");
    expect(out.allArticleIds).toEqual([articles[0].id]);
  });
});
