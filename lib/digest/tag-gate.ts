import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { tagUserArticles } from "@/lib/articles/tag-batch";
import { getEnrichableArticlesByIds } from "@/lib/db/queries/articles";
import type { DigestArticle } from "@/lib/digest/types";

export type TagGateOutcome =
  | { status: "ready"; retagged: boolean }
  | { status: "postponed"; reason: string };

export interface TagGateDeps {
  getLlmConfig: typeof getUserLlmConfig;
  getEnrichable: typeof getEnrichableArticlesByIds;
  tagBatch: typeof tagUserArticles;
}

const defaultDeps: TagGateDeps = {
  getLlmConfig: getUserLlmConfig,
  getEnrichable: getEnrichableArticlesByIds,
  tagBatch: tagUserArticles,
};

/**
 * Enforce "all articles tagged before the digest goes out".
 *
 * Applies only when the user has a working LLM config with auto-tag on.
 * Untagged candidates are tagged inline; an attempt that completes with zero
 * suggestions counts as processed (the article lands in Uncategorized). The
 * digest is postponed only when attempts FAIL (rate limit / LLM error) — the
 * minutely digest worker retries on the next tick.
 */
export async function ensureArticlesTagged(
  userId: string,
  articles: DigestArticle[],
  deps: TagGateDeps = defaultDeps,
): Promise<TagGateOutcome> {
  if (articles.length === 0) return { status: "ready", retagged: false };

  const llmConfig = await deps.getLlmConfig(userId);
  if (!llmConfig?.autoTag) return { status: "ready", retagged: false };

  const untaggedIds = articles.filter((a) => (a.tags?.length ?? 0) === 0).map((a) => a.id);
  if (untaggedIds.length === 0) return { status: "ready", retagged: false };

  const enrichable = await deps.getEnrichable(untaggedIds);
  const result = await deps.tagBatch(userId, enrichable, llmConfig);

  if (result.rateLimited || result.failed > 0) {
    const parts = [
      result.failed > 0 ? `${result.failed} attempt(s) failed` : null,
      result.rateLimited ? "rate-limited" : null,
    ].filter(Boolean);
    return { status: "postponed", reason: `tagging incomplete: ${parts.join(", ")}` };
  }

  return { status: "ready", retagged: true };
}
