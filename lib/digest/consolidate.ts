import type { Cluster } from "./cluster-types";

export const EVENT_MERGE_THRESHOLD = 0.6;
export const MAX_TOPICS = 8;

/** Each articleId belongs to exactly one cluster: the highest-importance claimant
 * (ties → earliest). Clusters left with no articles are dropped. Order preserved. */
export function dedupeArticleAssignments(clusters: Cluster[]): Cluster[] {
  const owner = new Map<string, number>();
  clusters.forEach((cluster, idx) => {
    for (const id of cluster.articleIds) {
      const cur = owner.get(id);
      if (cur === undefined || clusters[cur].importance < cluster.importance) {
        owner.set(id, idx);
      }
    }
  });
  return clusters
    .map((cluster, idx) => ({
      ...cluster,
      articleIds: cluster.articleIds.filter((id) => owner.get(id) === idx),
    }))
    .filter((cluster) => cluster.articleIds.length > 0);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Merge clusters describing the SAME event: overlapping articleIds, OR same
 * (case-insensitive) topic with headline Jaccard >= threshold. Distinct events
 * under the same topic stay separate. Higher-importance cluster's topic/headline wins. */
export function mergeSameEventClusters(
  clusters: Cluster[],
  threshold = EVENT_MERGE_THRESHOLD
): Cluster[] {
  const out: Cluster[] = [];
  for (const cluster of clusters) {
    const tokens = tokenize(cluster.headline);
    let mergedAt = -1;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      const overlap = cluster.articleIds.some((id) => o.articleIds.includes(id));
      const sameTopic = o.topic.trim().toLowerCase() === cluster.topic.trim().toLowerCase();
      if (overlap || (sameTopic && jaccard(tokenize(o.headline), tokens) >= threshold)) {
        mergedAt = i;
        break;
      }
    }
    if (mergedAt === -1) {
      out.push({ ...cluster, articleIds: [...cluster.articleIds] });
      continue;
    }
    const o = out[mergedAt];
    const winner = cluster.importance > o.importance ? cluster : o;
    out[mergedAt] = {
      topic: winner.topic,
      headline: winner.headline,
      importance: Math.max(o.importance, cluster.importance),
      articleIds: Array.from(new Set([...o.articleIds, ...cluster.articleIds])),
    };
  }
  return out;
}
