// tests/digest/tag-gate.test.ts
import { describe, it, expect, vi } from "vitest";
import { ensureArticlesTagged } from "@/lib/digest/tag-gate";
import type { DigestArticle } from "@/lib/digest/types";
import type { LlmConfig } from "@/lib/digest/llm-config";

const llm: LlmConfig = {
  enabled: true,
  baseUrl: "https://llm.test/v1",
  apiKey: "k",
  model: "m",
  format: "openai",
  autoSummarize: false,
  autoTag: true,
};

function art(id: string, tagged: boolean): DigestArticle {
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
    tags: tagged ? [{ id: "t1", name: "ai" }] : [],
  };
}

function deps(overrides: Partial<Parameters<typeof ensureArticlesTagged>[2]> = {}) {
  return {
    getLlmConfig: vi.fn(async () => llm),
    getEnrichable: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, title: `T-${id}`, summary: null, aiSummary: null, contentText: "body", contentHtml: null })),
    ),
    tagBatch: vi.fn(async () => ({ attempted: 1, tagged: 1, failed: 0, rateLimited: false })),
    ...overrides,
  };
}

describe("ensureArticlesTagged", () => {
  it("passes when auto-tag is disabled (no config)", async () => {
    const d = deps({ getLlmConfig: vi.fn(async () => null) });
    const out = await ensureArticlesTagged("u1", [art("a1", false)], d);
    expect(out).toEqual({ status: "ready", retagged: false });
    expect(d.tagBatch).not.toHaveBeenCalled();
  });

  it("passes when auto-tag is on but every article already has tags", async () => {
    const d = deps();
    const out = await ensureArticlesTagged("u1", [art("a1", true), art("a2", true)], d);
    expect(out).toEqual({ status: "ready", retagged: false });
    expect(d.tagBatch).not.toHaveBeenCalled();
  });

  it("tags untagged articles inline, then reports retagged so caller can re-fetch", async () => {
    const d = deps();
    const out = await ensureArticlesTagged("u1", [art("a1", true), art("a2", false)], d);
    expect(out).toEqual({ status: "ready", retagged: true });
    expect(d.getEnrichable).toHaveBeenCalledWith(["a2"]);
    expect(d.tagBatch).toHaveBeenCalledTimes(1);
  });

  it("POSTPONES when tagging is rate-limited", async () => {
    const d = deps({
      tagBatch: vi.fn(async () => ({ attempted: 0, tagged: 0, failed: 0, rateLimited: true })),
    });
    const out = await ensureArticlesTagged("u1", [art("a1", false)], d);
    expect(out.status).toBe("postponed");
  });

  it("POSTPONES when any tagging attempt failed", async () => {
    const d = deps({
      tagBatch: vi.fn(async () => ({ attempted: 1, tagged: 1, failed: 1, rateLimited: false })),
    });
    const out = await ensureArticlesTagged("u1", [art("a1", false), art("a2", false)], d);
    expect(out.status).toBe("postponed");
  });

  it("is ready for an empty article list", async () => {
    const d = deps();
    const out = await ensureArticlesTagged("u1", [], d);
    expect(out).toEqual({ status: "ready", retagged: false });
    expect(d.getLlmConfig).not.toHaveBeenCalled();
  });
});
