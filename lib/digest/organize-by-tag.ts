import type { DigestArticle, OrganizedDigest, TopHeadline, TopicGroup } from "@/lib/digest/types";

const UNCATEGORIZED_LABEL = "Uncategorized";

/**
 * Map the optional importance enum (set by the per-article summarize call)
 * to the numeric 1-10 scale used by the existing OrganizedDigest shape.
 */
function importanceToNumber(importance: DigestArticle["importance"]): number {
  if (importance === "high") return 9;
  if (importance === "med") return 6;
  if (importance === "low") return 3;
  return 5; // unscored
}

/**
 * Build an OrganizedDigest from already-enriched articles without ever calling
 * the LLM. Articles are grouped by their primary (first) tag, with untagged
 * ones falling into "Uncategorized". Top-level headlines pull articles marked
 * `importance: "high"` from anywhere in the batch.
 *
 * This is the replacement for `runClustering` — same output shape, but built
 * from data the background workers prepared incrementally instead of one
 * giant LLM call at digest time.
 */
export function buildTagBasedDigest(
  articles: DigestArticle[],
  now: Date = new Date(),
): OrganizedDigest {
  // Group articles by their first tag (primary). Articles with no tags drop
  // into the uncategorised bucket — they still appear in the digest.
  const byTag = new Map<string, { name: string; items: DigestArticle[] }>();
  const uncategorized: DigestArticle[] = [];

  for (const a of articles) {
    const primary = a.tags?.[0];
    if (!primary) {
      uncategorized.push(a);
      continue;
    }
    let bucket = byTag.get(primary.id);
    if (!bucket) {
      bucket = { name: primary.name, items: [] };
      byTag.set(primary.id, bucket);
    }
    bucket.items.push(a);
  }

  // Sort tag groups by size desc, then by name asc for a stable, scannable order.
  const sortedTagGroups = Array.from(byTag.values()).sort(
    (a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name),
  );

  // Top headlines: any article scored "high" by the summarize call. Cap at 5.
  const topHeadlines: TopHeadline[] = articles
    .filter((a) => a.importance === "high")
    .slice(0, 5)
    .map((a) => ({
      cluster: {
        topic: a.tags?.[0]?.name ?? UNCATEGORIZED_LABEL,
        headline: a.title ?? "(untitled)",
        importance: importanceToNumber(a.importance),
        articleIds: [a.id],
      },
      primaryArticle: a,
      sourceCount: 1,
    }));

  const topicGroups: TopicGroup[] = sortedTagGroups.map((group) => ({
    topic: group.name,
    totalCount: group.items.length,
    clusters: group.items.map((a) => ({
      cluster: {
        topic: group.name,
        headline: a.title ?? "(untitled)",
        importance: importanceToNumber(a.importance),
        articleIds: [a.id],
      },
      primary: a,
      duplicates: [],
    })),
  }));

  return {
    date: now,
    totalArticles: articles.length,
    topicCount: topicGroups.length,
    topHeadlines,
    topicGroups,
    ungrouped: uncategorized,
    mode: "clustered",
  };
}
