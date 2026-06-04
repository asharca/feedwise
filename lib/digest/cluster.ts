import { ClusterResponseSchema, clusterResponseJsonSchema } from "./cluster-types";
import type { Cluster, ClusterResponse } from "./cluster-types";
import type { DedupedArticle } from "./types";
import { type ChatCompletionInput, withLlmRetry } from "./llm-client";
import { consolidateClusters } from "./consolidate";

const BATCH_SIZE = 150;

export const SYSTEM_PROMPT = `You are an RSS digest assistant. Cluster the candidate articles, rank them by importance, and produce a concise English headline per cluster.

Rules:
1. A cluster is ONE event/story. Put every article describing the same event into the same cluster, even when sources, wording, or languages differ. Distinct events are distinct clusters.
2. \`topic\` is a broad CATEGORY label shared across clusters (<= 40 chars, e.g. "AI", "Open Source", "Geopolitics", "Web Dev"). Many clusters may share one topic. Reuse the exact same string for the same category.
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

async function clusterBatch(batch: DedupedArticle[], client: ClientFn): Promise<ClusterResponse> {
  const raw = await withLlmRetry(() =>
    client({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(batch),
      jsonSchema: { name: "ClusterResponse", schema: clusterResponseJsonSchema },
    }),
  );
  const parsed = ClusterResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`LLM response failed schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function runClustering(
  deduped: DedupedArticle[],
  client: ClientFn,
): Promise<ClusterResponse> {
  const knownIds = new Set(deduped.map((d) => d.primary.id));
  const batches: DedupedArticle[][] = [];
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    batches.push(deduped.slice(i, i + BATCH_SIZE));
  }

  const allClusters: Cluster[] = [];
  for (const batch of batches) {
    const resp = await clusterBatch(batch, client);
    for (const cl of resp.clusters) {
      const filtered = cl.articleIds.filter((id) => knownIds.has(id));
      if (filtered.length > 0) allClusters.push({ ...cl, articleIds: filtered });
    }
  }

  return { clusters: consolidateClusters(allClusters) };
}
