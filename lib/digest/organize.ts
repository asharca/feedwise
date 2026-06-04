import type { ClusterResponse } from "./cluster-types";
import type { DedupedArticle, OrganizedDigest, TopHeadline, TopicGroup } from "./types";

const TOP_N = 5;

export function organize(deduped: DedupedArticle[], response: ClusterResponse): OrganizedDigest {
  const byPrimaryId = new Map<string, DedupedArticle>();
  for (const d of deduped) byPrimaryId.set(d.primary.id, d);

  const clustersWithArticles = response.clusters
    .map((c) => {
      const members = c.articleIds
        .map((id) => byPrimaryId.get(id))
        .filter((d): d is DedupedArticle => d !== undefined);
      return { cluster: c, members };
    })
    .filter((cm) => cm.members.length > 0);

  const sortedByImp = [...clustersWithArticles].sort(
    (a, b) => b.cluster.importance - a.cluster.importance,
  );
  const topHeadlines: TopHeadline[] = sortedByImp.slice(0, TOP_N).map((cm) => {
    const totalSources = cm.members.reduce((n, m) => n + 1 + m.duplicates.length, 0);
    return {
      cluster: cm.cluster,
      primaryArticle: cm.members[0].primary,
      sourceCount: totalSources,
    };
  });

  const byTopic = new Map<string, typeof clustersWithArticles>();
  for (const cm of clustersWithArticles) {
    const arr = byTopic.get(cm.cluster.topic);
    if (arr) arr.push(cm);
    else byTopic.set(cm.cluster.topic, [cm]);
  }

  const topicGroups: TopicGroup[] = Array.from(byTopic.entries()).map(([topic, list]) => {
    const totalCount = list.reduce(
      (n, cm) => n + cm.members.reduce((m, x) => m + 1 + x.duplicates.length, 0),
      0,
    );
    return {
      topic,
      totalCount,
      clusters: list.map((cm) => ({
        cluster: cm.cluster,
        primary: cm.members[0].primary,
        duplicates: [
          ...cm.members[0].duplicates,
          ...cm.members.slice(1).flatMap((m) => [m.primary, ...m.duplicates]),
        ],
      })),
    };
  });

  const referenced = new Set<string>();
  for (const cm of clustersWithArticles) {
    for (const m of cm.members) referenced.add(m.primary.id);
  }
  const ungroupedItems = deduped.filter((d) => !referenced.has(d.primary.id));
  const ungrouped = ungroupedItems.flatMap((d) => [d.primary, ...d.duplicates]);

  const total = deduped.reduce((n, d) => n + 1 + d.duplicates.length, 0);

  return {
    date: new Date(),
    totalArticles: total,
    topicCount: topicGroups.length,
    topHeadlines,
    topicGroups,
    ungrouped,
    mode: "clustered",
  };
}
