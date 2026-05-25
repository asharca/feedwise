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
