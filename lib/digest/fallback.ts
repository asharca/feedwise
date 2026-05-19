import type { DedupedArticle, OrganizedDigest } from "./types";

export type FallbackReason = "no-config" | "llm-failed";

export function buildFallback(deduped: DedupedArticle[], reason: FallbackReason): OrganizedDigest {
  const all = deduped.flatMap((d) => [d.primary, ...d.duplicates]);
  return {
    date: new Date(),
    totalArticles: all.length,
    topicCount: 0,
    topHeadlines: [],
    topicGroups: [],
    ungrouped: all,
    mode: reason === "no-config" ? "fallback-no-config" : "fallback-llm-failed",
  };
}
