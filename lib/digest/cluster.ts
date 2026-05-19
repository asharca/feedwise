import { ClusterResponseSchema, clusterResponseJsonSchema } from "./cluster-types";
import type { Cluster, ClusterResponse } from "./cluster-types";
import type { DedupedArticle } from "./types";
import type { ChatCompletionInput } from "./llm-client";

const BATCH_SIZE = 150;
const MAX_TOPICS = 8;

export const SYSTEM_PROMPT = `You are an RSS digest assistant. Cluster the candidate articles by topic, rank them by importance, and produce a concise English headline per cluster.

Rules:
1. Merge articles describing the same event/topic into one cluster, even when sources, wording, or languages differ.
2. \`topic\` is a broad category (<= 40 chars, e.g. "AI", "Open Source", "Geopolitics", "Web Dev"). Reuse the same string for related clusters.
3. Total distinct topics MUST be <= 8.
4. \`headline\` is one English sentence summarizing the event, <= 120 chars, no emoji. English even when sources are in other languages.
5. \`importance\` is 1-10. Wide coverage, broad impact, time-sensitive -> high. Niche personal blog or promo -> low. AT MOST 5 clusters may have importance >= 8.
6. Each article must belong to exactly one cluster. Single-article clusters are allowed.
7. Return ONLY JSON matching the provided schema.`;

type ClientFn = (input: ChatCompletionInput) => Promise<unknown>;

function buildUserPrompt(batch: DedupedArticle[]): string {
  const items = batch.map((d) => ({
    id: d.primary.id,
    title: d.primary.title ?? "",
    summary: (d.primary.summary ?? "").slice(0, 200),
    source: d.primary.feedTitle ?? "",
  }));
  return `Today's candidate articles (${items.length} items):\n${JSON.stringify(items)}\nReturn clusters per schema.`;
}

async function clusterBatch(
  batch: DedupedArticle[],
  client: ClientFn
): Promise<ClusterResponse> {
  const raw = await client({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(batch),
    jsonSchema: { name: "ClusterResponse", schema: clusterResponseJsonSchema },
  });
  const parsed = ClusterResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`LLM response failed schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

function mergeByTopic(clusters: Cluster[]): Cluster[] {
  const groups = new Map<string, Cluster[]>();
  for (const c of clusters) {
    const k = c.topic.trim().toLowerCase();
    const arr = groups.get(k);
    if (arr) arr.push(c);
    else groups.set(k, [c]);
  }
  const out: Cluster[] = [];
  for (const arr of groups.values()) {
    const top = arr.reduce((a, b) => (b.importance > a.importance ? b : a));
    out.push({
      topic: top.topic.trim(),
      headline: top.headline,
      importance: top.importance,
      articleIds: arr.flatMap((c) => c.articleIds),
    });
  }
  return out;
}

function foldExtraTopics(clusters: Cluster[]): Cluster[] {
  const byTopic = new Map<string, Cluster[]>();
  for (const c of clusters) {
    const arr = byTopic.get(c.topic);
    if (arr) arr.push(c);
    else byTopic.set(c.topic, [c]);
  }
  if (byTopic.size <= MAX_TOPICS) return clusters;

  const topicMaxImp = Array.from(byTopic.entries())
    .map(([t, cs]) => ({ t, maxImp: Math.max(...cs.map((c) => c.importance)) }))
    .sort((a, b) => b.maxImp - a.maxImp);
  // Reserve one slot for "Other" when we have overflow, so total topics stay <= MAX_TOPICS.
  const keep = new Set(topicMaxImp.slice(0, MAX_TOPICS - 1).map((x) => x.t));
  const kept: Cluster[] = [];
  const other: Cluster[] = [];
  for (const c of clusters) {
    if (keep.has(c.topic)) kept.push(c);
    else other.push(c);
  }
  kept.push({
    topic: "Other",
    headline: "Misc",
    importance: Math.max(...other.map((c) => c.importance)),
    articleIds: other.flatMap((c) => c.articleIds),
  });
  return kept;
}

export async function runClustering(
  deduped: DedupedArticle[],
  client: ClientFn
): Promise<ClusterResponse> {
  const knownIds = new Set(deduped.map((d) => d.primary.id));
  const batches: DedupedArticle[][] = [];
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    batches.push(deduped.slice(i, i + BATCH_SIZE));
  }

  const allClusters: Cluster[] = [];
  for (const batch of batches) {
    const resp = await clusterBatch(batch, client);
    for (const c of resp.clusters) {
      const filtered = c.articleIds.filter((id) => knownIds.has(id));
      if (filtered.length > 0) {
        allClusters.push({ ...c, articleIds: filtered });
      }
    }
  }

  const merged = mergeByTopic(allClusters);
  const folded = foldExtraTopics(merged);
  return { clusters: folded };
}
