# Digest Email Polish + Clustering Accuracy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily digest email refined ("Top Stories + topic groups", title+brief, no images, no expand, click-to-read-and-auto-save) and make its LLM clustering accurate (distinct events preserved per topic).

**Architecture:** Fix the digest pipeline so post-LLM consolidation preserves event-level clusters grouped by topic (replacing the topic-flattening `mergeByTopic`). Rebuild the email template to layout A with an injected `buildLink`. Add an opt-in signed-token redirect (`/api/r`) that stars an article on click. Refactor the settings page into a left section-nav with extracted section components.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle ORM + PostgreSQL, Vitest, node:crypto (HMAC).

**Spec:** `docs/superpowers/specs/2026-05-25-digest-email-polish-design.md`

**Conventions:**

- Tests live in `tests/**` mirroring `lib/**`. `@` = repo root.
- Run all tests: `pnpm test`. Run one file: `pnpm exec vitest run <path>`. Run one test: `pnpm exec vitest run <path> -t "<name>"`.
- Commit per task (conventional commits). Work on a feature branch/worktree, not `main`.

---

## Phase 1 — Clustering Accuracy (`lib/digest/`)

New module `lib/digest/consolidate.ts` holds the pure post-LLM consolidation functions; `cluster.ts` is rewired to call them and loses `mergeByTopic`.

### Task 1: `consolidate.ts` — dedupe article assignment

**Files:**

- Create: `lib/digest/consolidate.ts`
- Test: `tests/digest/consolidate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/digest/consolidate.test.ts
import { describe, it, expect } from "vitest";
import { dedupeArticleAssignments } from "@/lib/digest/consolidate";
import type { Cluster } from "@/lib/digest/cluster-types";

const c = (over: Partial<Cluster>): Cluster => ({
  topic: "T", headline: "h", importance: 5, articleIds: ["a"], ...over,
});

describe("dedupeArticleAssignments", () => {
  it("keeps each articleId only in the highest-importance cluster", () => {
    const out = dedupeArticleAssignments([
      c({ topic: "Low", importance: 3, articleIds: ["x", "y"] }),
      c({ topic: "High", importance: 9, articleIds: ["y", "z"] }),
    ]);
    const low = out.find((k) => k.topic === "Low")!;
    const high = out.find((k) => k.topic === "High")!;
    expect(high.articleIds).toEqual(["y", "z"]);
    expect(low.articleIds).toEqual(["x"]);
  });

  it("drops clusters left empty after deduping", () => {
    const out = dedupeArticleAssignments([
      c({ topic: "A", importance: 9, articleIds: ["x"] }),
      c({ topic: "B", importance: 2, articleIds: ["x"] }),
    ]);
    expect(out.map((k) => k.topic)).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/digest/consolidate.test.ts`
Expected: FAIL — `dedupeArticleAssignments` is not exported / module missing.

- [ ] **Step 3: Implement**

```ts
// lib/digest/consolidate.ts
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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/digest/consolidate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/digest/consolidate.ts tests/digest/consolidate.test.ts
git commit -m "feat(digest): add dedupeArticleAssignments consolidation"
```

---

### Task 2: `consolidate.ts` — merge same-event clusters

**Files:**

- Modify: `lib/digest/consolidate.ts`
- Test: `tests/digest/consolidate.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append to tests/digest/consolidate.test.ts
import { mergeSameEventClusters } from "@/lib/digest/consolidate";

describe("mergeSameEventClusters", () => {
  it("merges clusters with same topic and near-identical headline (cross-batch)", () => {
    const out = mergeSameEventClusters([
      c({ topic: "World", headline: "Ceasefire talks resume in capital", importance: 7, articleIds: ["a"] }),
      c({ topic: "world", headline: "Ceasefire talks resume in the capital", importance: 9, articleIds: ["b"] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].articleIds.sort()).toEqual(["a", "b"]);
    expect(out[0].importance).toBe(9);
    expect(out[0].headline).toBe("Ceasefire talks resume in the capital"); // higher-importance wins
  });

  it("keeps distinct events under the same topic separate", () => {
    const out = mergeSameEventClusters([
      c({ topic: "World", headline: "Ceasefire talks resume", importance: 8, articleIds: ["a"] }),
      c({ topic: "World", headline: "Major earthquake hits coast", importance: 8, articleIds: ["b"] }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("merges clusters that share an articleId regardless of headline", () => {
    const out = mergeSameEventClusters([
      c({ topic: "A", headline: "one", importance: 5, articleIds: ["x"] }),
      c({ topic: "B", headline: "two", importance: 5, articleIds: ["x", "y"] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].articleIds.sort()).toEqual(["x", "y"]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/digest/consolidate.test.ts -t "mergeSameEventClusters"`
Expected: FAIL — `mergeSameEventClusters` not exported.

- [ ] **Step 3: Implement (append to `lib/digest/consolidate.ts`)**

```ts
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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/digest/consolidate.test.ts`
Expected: PASS (all consolidate tests so far).

- [ ] **Step 5: Commit**

```bash
git add lib/digest/consolidate.ts tests/digest/consolidate.test.ts
git commit -m "feat(digest): merge same-event clusters, preserve distinct events"
```

---

### Task 3: `consolidate.ts` — normalize topics + fold extra topics (relabel)

**Files:**

- Modify: `lib/digest/consolidate.ts`
- Test: `tests/digest/consolidate.test.ts`

- [ ] **Step 1: Add the failing tests**

```ts
// append to tests/digest/consolidate.test.ts
import { normalizeTopics, foldExtraTopics, consolidateClusters } from "@/lib/digest/consolidate";

describe("normalizeTopics", () => {
  it("unifies case/whitespace variants to one display label (first-seen casing)", () => {
    const out = normalizeTopics([
      c({ topic: "AI", articleIds: ["a"] }),
      c({ topic: "  ai ", articleIds: ["b"] }),
      c({ topic: "Ai", articleIds: ["d"] }),
    ]);
    expect(new Set(out.map((k) => k.topic))).toEqual(new Set(["AI"]));
  });
});

describe("foldExtraTopics", () => {
  it("relabels overflow topics to 'Other' but keeps clusters separate", () => {
    const clusters = Array.from({ length: 10 }, (_, i) =>
      c({ topic: `T${i}`, importance: 10 - i, articleIds: [`a${i}`] })
    );
    const out = foldExtraTopics(clusters, 8);
    const topics = new Set(out.map((k) => k.topic));
    expect(topics.size).toBeLessThanOrEqual(8);
    expect(topics.has("Other")).toBe(true);
    // overflow stays as separate event clusters, not one merged blob
    expect(out.filter((k) => k.topic === "Other").length).toBe(3);
  });

  it("is a no-op when topics <= max", () => {
    const clusters = [c({ topic: "A", articleIds: ["a"] }), c({ topic: "B", articleIds: ["b"] })];
    expect(foldExtraTopics(clusters, 8)).toEqual(clusters);
  });
});

describe("consolidateClusters", () => {
  it("runs merge -> dedupe -> normalize -> fold end to end", () => {
    const out = consolidateClusters([
      c({ topic: "World", headline: "Quake hits coast", importance: 8, articleIds: ["a"] }),
      c({ topic: "world", headline: "Quake hits the coast", importance: 6, articleIds: ["b"] }),
      c({ topic: "Tech", headline: "New chip launches", importance: 7, articleIds: ["c"] }),
    ]);
    // first two merge (same event), Tech stays
    expect(out).toHaveLength(2);
    expect(new Set(out.map((k) => k.topic))).toEqual(new Set(["World", "Tech"]));
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/digest/consolidate.test.ts -t "normalizeTopics|foldExtraTopics|consolidateClusters"`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement (append to `lib/digest/consolidate.ts`)**

```ts
/** Canonicalize topic labels (trim, collapse whitespace, case-insensitive) so
 * grouping is robust. Events are never merged here — only the topic string changes. */
export function normalizeTopics(clusters: Cluster[]): Cluster[] {
  const canonical = new Map<string, string>();
  return clusters.map((cluster) => {
    const display = cluster.topic.trim().replace(/\s+/g, " ");
    const key = display.toLowerCase();
    const existing = canonical.get(key);
    if (existing) return { ...cluster, topic: existing };
    canonical.set(key, display);
    return { ...cluster, topic: display };
  });
}

/** Cap distinct topics at maxTopics. Overflow clusters keep their identity but get
 * topic "Other" (separate event clusters, NOT merged into one). */
export function foldExtraTopics(clusters: Cluster[], maxTopics = MAX_TOPICS): Cluster[] {
  const byTopic = new Map<string, Cluster[]>();
  for (const cluster of clusters) {
    const arr = byTopic.get(cluster.topic);
    if (arr) arr.push(cluster);
    else byTopic.set(cluster.topic, [cluster]);
  }
  if (byTopic.size <= maxTopics) return clusters;

  const ranked = Array.from(byTopic.entries())
    .map(([topic, cs]) => ({ topic, maxImp: Math.max(...cs.map((k) => k.importance)) }))
    .sort((a, b) => b.maxImp - a.maxImp);
  const keep = new Set(ranked.slice(0, maxTopics - 1).map((x) => x.topic));
  return clusters.map((cluster) =>
    keep.has(cluster.topic) ? cluster : { ...cluster, topic: "Other" }
  );
}

/** Full post-LLM pipeline. */
export function consolidateClusters(clusters: Cluster[]): Cluster[] {
  return foldExtraTopics(
    normalizeTopics(dedupeArticleAssignments(mergeSameEventClusters(clusters)))
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/digest/consolidate.test.ts`
Expected: PASS (entire file).

- [ ] **Step 5: Commit**

```bash
git add lib/digest/consolidate.ts tests/digest/consolidate.test.ts
git commit -m "feat(digest): normalize topics + relabel-not-merge overflow"
```

---

### Task 4: Add retryable LLM wrapper

**Files:**

- Modify: `lib/digest/llm-client.ts`
- Test: `tests/digest/llm-client.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
// append to tests/digest/llm-client.test.ts
import { withLlmRetry } from "@/lib/digest/llm-client";
import { LlmTimeoutError, LlmRateLimitError, LlmHttpError } from "@/lib/digest/llm-client";
import { describe, it, expect, vi } from "vitest";

describe("withLlmRetry", () => {
  it("retries transient errors then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new LlmTimeoutError())
      .mockRejectedValueOnce(new LlmRateLimitError())
      .mockResolvedValue("ok");
    const out = await withLlmRetry(fn, { retries: 2, baseDelayMs: 0 });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new LlmHttpError(400, "bad"));
    await expect(withLlmRetry(fn, { retries: 2, baseDelayMs: 0 })).rejects.toBeInstanceOf(LlmHttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new LlmTimeoutError());
    await expect(withLlmRetry(fn, { retries: 1, baseDelayMs: 0 })).rejects.toBeInstanceOf(LlmTimeoutError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/digest/llm-client.test.ts -t "withLlmRetry"`
Expected: FAIL — `withLlmRetry` not exported.

- [ ] **Step 3: Implement (append to `lib/digest/llm-client.ts`)**

```ts
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
}

/** Retry a fn on transient LLM errors (timeout, 429) with exponential backoff. */
export async function withLlmRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = err instanceof LlmTimeoutError || err instanceof LlmRateLimitError;
      if (!transient || attempt === retries) throw err;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/digest/llm-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/digest/llm-client.ts tests/digest/llm-client.test.ts
git commit -m "feat(digest): add withLlmRetry for transient LLM failures"
```

---

### Task 5: Rewire `cluster.ts` to use consolidation + retry, tighten prompt

**Files:**

- Modify: `lib/digest/cluster.ts`
- Test: `tests/digest/cluster.test.ts` (existing tests must stay green; add new ones)

- [ ] **Step 1: Add new tests asserting new guarantees**

```ts
// append to tests/digest/cluster.test.ts
import { LlmTimeoutError } from "@/lib/digest/llm-client";

describe("runClustering — event preservation", () => {
  it("keeps distinct events under one topic as separate clusters", async () => {
    const deduped = makeDeduped(2);
    const client = vi.fn().mockResolvedValue({
      clusters: [
        { topic: "World", headline: "Ceasefire talks resume", importance: 8, articleIds: [deduped[0].primary.id] },
        { topic: "World", headline: "Major earthquake hits coast", importance: 7, articleIds: [deduped[1].primary.id] },
      ],
    });
    const out = await runClustering(deduped, client);
    expect(out.clusters).toHaveLength(2);
    expect(out.clusters.every((k) => k.topic === "World")).toBe(true);
  });

  it("retries a transient LLM failure within a batch", async () => {
    const deduped = makeDeduped(2);
    const client = vi.fn()
      .mockRejectedValueOnce(new LlmTimeoutError())
      .mockResolvedValue({
        clusters: [{ topic: "X", headline: "h", importance: 5, articleIds: deduped.map((d) => d.primary.id) }],
      });
    const out = await runClustering(deduped, client);
    expect(client).toHaveBeenCalledTimes(2);
    expect(out.clusters).toHaveLength(1);
  });
});

describe("SYSTEM_PROMPT — event vs topic", () => {
  it("states that a cluster is one event and topic is a shared category", () => {
    expect(SYSTEM_PROMPT).toMatch(/one event/i);
    expect(SYSTEM_PROMPT).toMatch(/category/i);
  });
});
```

- [ ] **Step 2: Run test, verify the new ones fail**

Run: `pnpm exec vitest run tests/digest/cluster.test.ts`
Expected: FAIL on "event preservation" + the prompt test (old behavior flattens by topic; prompt lacks the new phrasing).

- [ ] **Step 3: Implement — rewrite `lib/digest/cluster.ts`**

Replace the file's body so that: `mergeByTopic` and the old `foldExtraTopics` are removed; the batch call is wrapped in `withLlmRetry`; consolidation runs via `consolidateClusters`; `SYSTEM_PROMPT` is tightened. Keep `BATCH_SIZE = 150`, `runClustering(deduped, client)` signature, and the unknown-id filtering.

```ts
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
    })
  );
  const parsed = ClusterResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`LLM response failed schema: ${parsed.error.message}`);
  }
  return parsed.data;
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
    for (const cl of resp.clusters) {
      const filtered = cl.articleIds.filter((id) => knownIds.has(id));
      if (filtered.length > 0) allClusters.push({ ...cl, articleIds: filtered });
    }
  }

  return { clusters: consolidateClusters(allClusters) };
}
```

Note: the retry uses `withLlmRetry` default delays (250ms base). The "retries a transient failure" test passes a real-timer delay of 250ms once — acceptable (<1s). If flaky, lower by exporting a retry option, but default is fine here.

- [ ] **Step 4: Run the full cluster + digest suite, verify green**

Run: `pnpm exec vitest run tests/digest/`
Expected: PASS — including the pre-existing `runClustering` tests (they remain valid) and the new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/digest/cluster.ts tests/digest/cluster.test.ts
git commit -m "refactor(digest): preserve events via consolidateClusters; tighten prompt; retry batches"
```

---

### Task 6: organize regression — multiple clusters per topic

**Files:**

- Test: `tests/digest/organize.test.ts`

- [ ] **Step 1: Add the failing/guard test**

```ts
// append to tests/digest/organize.test.ts
import { organize } from "@/lib/digest/organize";
import type { DedupedArticle } from "@/lib/digest/types";

function ded(id: string, title: string): DedupedArticle {
  return {
    primary: { id, title, url: `https://e.com/${id}`, summary: `s ${title}`, feedTitle: "feed", publishedAt: new Date("2026-05-25T00:00:00Z") },
    duplicates: [],
  };
}

describe("organize — multiple events per topic", () => {
  it("renders each event as its own cluster within a topic group", () => {
    const a = "11111111-1111-4111-a111-000000000001";
    const b = "11111111-1111-4111-a111-000000000002";
    const deduped = [ded(a, "Ceasefire talks resume"), ded(b, "Earthquake hits coast")];
    const response = {
      clusters: [
        { topic: "World", headline: "Ceasefire talks resume", importance: 9, articleIds: [a] },
        { topic: "World", headline: "Earthquake hits coast", importance: 8, articleIds: [b] },
      ],
    };
    const digest = organize(deduped, response);
    const world = digest.topicGroups.find((g) => g.topic === "World")!;
    expect(world.clusters).toHaveLength(2); // two distinct events, NOT one + duplicate
    expect(world.clusters.every((cl) => cl.duplicates.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm exec vitest run tests/digest/organize.test.ts -t "multiple events"`
Expected: PASS (organize already supports this; the bug was upstream in cluster.ts). This test is a regression guard. If it FAILS, organize needs no change for this plan — investigate, but it should pass.

- [ ] **Step 3: Commit**

```bash
git add tests/digest/organize.test.ts
git commit -m "test(digest): guard multiple event clusters per topic group"
```

---

## Phase 2 — Email Layout A (`lib/email/`)

### Task 7: `brief.ts` — plain-text brief helper

**Files:**

- Create: `lib/email/brief.ts`
- Test: `tests/email/brief.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/email/brief.test.ts
import { describe, it, expect } from "vitest";
import { briefText } from "@/lib/email/brief";

describe("briefText", () => {
  it("strips HTML and collapses whitespace", () => {
    expect(briefText("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });
  it("decodes common entities", () => {
    expect(briefText("A &amp; B &lt;ok&gt;")).toBe("A & B <ok>");
  });
  it("clamps to maxLen with ellipsis", () => {
    expect(briefText("x".repeat(200), 10)).toBe("xxxxxxxxx…");
  });
  it("returns empty string for null/empty", () => {
    expect(briefText(null)).toBe("");
    expect(briefText("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/email/brief.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// lib/email/brief.ts
/** Plain-text, length-clamped brief derived from a (possibly HTML) summary. */
export function briefText(summary: string | null | undefined, maxLen = 140): string {
  if (!summary) return "";
  const text = summary
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "…";
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/email/brief.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/brief.ts tests/email/brief.test.ts
git commit -m "feat(email): add briefText plain-text summary helper"
```

---

### Task 8: Rewrite `digest-html.ts` to layout A + `buildLink`

**Files:**

- Modify: `lib/email/templates/digest-html.ts`
- Test: `tests/email/templates/digest-html.test.ts` (update for new layout)

- [ ] **Step 1: Replace the test file with layout-A assertions**

```ts
// tests/email/templates/digest-html.test.ts
import { describe, it, expect } from "vitest";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import type { OrganizedDigest, DigestArticle } from "@/lib/digest/types";

function art(id: string, title: string): DigestArticle {
  return { id, title, url: `https://e.com/${id}`, summary: `<p>Brief for ${title}</p>`, feedTitle: "Reuters", publishedAt: new Date("2026-05-25T08:00:00Z") };
}

function digest(): OrganizedDigest {
  const a = art("a", "Ceasefire talks resume");
  const b = art("b", "Earthquake hits coast");
  const cluster = (topic: string, headline: string, importance: number) => ({ topic, headline, importance, articleIds: [] as string[] });
  return {
    date: new Date("2026-05-25T08:00:00Z"),
    totalArticles: 2,
    topicCount: 1,
    topHeadlines: [{ cluster: cluster("World", "Ceasefire talks resume", 9), primaryArticle: a, sourceCount: 3 }],
    topicGroups: [{
      topic: "World",
      totalCount: 2,
      clusters: [
        { cluster: cluster("World", "Ceasefire talks resume", 9), primary: a, duplicates: [] },
        { cluster: cluster("World", "Earthquake hits coast", 8), primary: b, duplicates: [] },
      ],
    }],
    ungrouped: [],
    mode: "clustered",
  };
}

describe("renderDigestHtml (layout A)", () => {
  it("renders multiple event items under a topic", () => {
    const html = renderDigestHtml(digest());
    expect(html).toContain("Ceasefire talks resume");
    expect(html).toContain("Earthquake hits coast");
  });
  it("contains no expand/collapse markup", () => {
    const html = renderDigestHtml(digest());
    expect(html).not.toContain("<details");
    expect(html).not.toMatch(/other source/i);
  });
  it("renders the plain-text brief, not raw HTML summary", () => {
    const html = renderDigestHtml(digest());
    expect(html).toContain("Brief for Ceasefire talks resume");
    expect(html).not.toContain("<p>Brief for");
  });
  it("uses the injected buildLink for article hrefs", () => {
    const html = renderDigestHtml(digest(), (a) => `https://app/r?id=${a.id}`);
    expect(html).toContain('href="https://app/r?id=a"');
    expect(html).toContain('href="https://app/r?id=b"');
  });
  it("defaults links to the article url", () => {
    const html = renderDigestHtml(digest());
    expect(html).toContain('href="https://e.com/a"');
  });
  it("contains no <img> tags", () => {
    expect(renderDigestHtml(digest())).not.toContain("<img");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/email/templates/digest-html.test.ts`
Expected: FAIL — current template links to topic anchors, includes `<details>`, ignores `buildLink`, renders raw summary HTML.

- [ ] **Step 3: Implement — rewrite `lib/email/templates/digest-html.ts`**

```ts
import type { OrganizedDigest, DigestArticle, TopicGroup, TopHeadline } from "@/lib/digest/types";
import { briefText } from "../brief";

type LinkFn = (article: DigestArticle) => string;
const defaultLink: LinkFn = (a) => a.url ?? "";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderHeadline(h: TopHeadline, i: number, link: LinkFn): string {
  const num = `(${i + 1})`;
  return `
    <div style="margin-bottom:10px;">
      <span style="color:#94a3b8;font-variant-numeric:tabular-nums;">${num}</span>
      <a href="${esc(link(h.primaryArticle))}" style="color:#2563eb;text-decoration:none;font-weight:500;">${esc(h.cluster.headline)}</a>
      <span style="color:#94a3b8;font-size:12px;"> &middot; ${esc(h.cluster.topic)} &middot; ${h.sourceCount} source${h.sourceCount === 1 ? "" : "s"} &middot; &#9733; ${h.cluster.importance}</span>
    </div>`;
}

function renderItem(primary: DigestArticle, dupCount: number, link: LinkFn): string {
  const brief = briefText(primary.summary);
  const sources = dupCount > 0 ? ` &middot; ${dupCount + 1} sources` : "";
  return `
    <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #eee;">
      <a href="${esc(link(primary))}" style="color:#111;text-decoration:none;font-weight:500;font-size:15px;">${esc(primary.title)}</a>
      <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${esc(primary.feedTitle)} &middot; ${esc(fmtDate(primary.publishedAt))}${sources}</div>
      ${brief ? `<div style="color:#444;font-size:13px;line-height:1.55;margin-top:6px;">${esc(brief)}</div>` : ""}
    </div>`;
}

function renderTopicGroup(g: TopicGroup, link: LinkFn): string {
  return `
    <div style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${esc(g.topic)} <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${g.totalCount})</span></h2>
      ${g.clusters.map((c) => renderItem(c.primary, c.duplicates.length, link)).join("")}
    </div>`;
}

function renderUngrouped(items: DigestArticle[], link: LinkFn): string {
  if (items.length === 0) return "";
  return `
    <div style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">More <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${items.length})</span></h2>
      ${items.map((a) => renderItem(a, 0, link)).join("")}
    </div>`;
}

export function renderDigestHtml(digest: OrganizedDigest, buildLink: LinkFn = defaultLink): string {
  const dateStr = digest.date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:8px;">
        <tr><td style="padding:18px 28px;border-bottom:1px solid #e2e8f0;">
          <div style="color:#111;font-size:18px;font-weight:600;">Feedwise Digest</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${esc(dateStr)} &middot; ${digest.totalArticles} articles &middot; ${digest.topicCount} topics</div>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          ${digest.topHeadlines.length > 0 ? `<h2 style="margin:0 0 14px 0;font-size:13px;color:#94a3b8;letter-spacing:0.08em;">TOP STORIES</h2>${digest.topHeadlines.map((h, i) => renderHeadline(h, i, buildLink)).join("")}` : ""}
          ${digest.topicGroups.map((g) => renderTopicGroup(g, buildLink)).join("")}
          ${renderUngrouped(digest.ungrouped, buildLink)}
        </td></tr>
        <tr><td style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center;">
          Feedwise daily digest.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
```

Note: `safeSummaryHtml` import is dropped here. If no other file imports `lib/email/summary-html.ts`, leave it in place (don't delete pre-existing code unless orphaned by this change). Verify with `grep -rn "summary-html" lib app tests` and only remove if this was its sole consumer.

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/email/templates/digest-html.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates/digest-html.ts tests/email/templates/digest-html.test.ts
git commit -m "feat(email): layout A digest (title+brief, no images/expand, buildLink)"
```

---

## Phase 3 — Click-to-Auto-Save

### Task 9: DB column `autoSaveOnClick` + settings plumbing

**Files:**

- Modify: `lib/db/schema.ts` (emailSubscriptions table, after `llmModel`)
- Modify: `lib/email/queries.ts` (`SubscriptionSettings`, `getSubscriptionSettings`, `updateSubscriptionSettings` insert + update, `getAllActiveSubscriptions` select)
- Modify: `app/api/settings/email/route.ts` (`updateSchema`)
- Generate + apply migration

- [ ] **Step 1: Add the schema column**

In `lib/db/schema.ts`, inside `emailSubscriptions`, after `llmModel: varchar("llm_model", { length: 100 }),`:

```ts
    autoSaveOnClick: boolean("auto_save_on_click").notNull().default(false),
```

- [ ] **Step 2: Generate + apply migration**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: a new file in `drizzle/` adding `auto_save_on_click`; migrate applies cleanly.

- [ ] **Step 3: Plumb through queries (`lib/email/queries.ts`)**

In `SubscriptionSettings` interface add:

```ts
  autoSaveOnClick?: boolean;
```

In `getSubscriptionSettings` return object add:

```ts
    autoSaveOnClick: sub.autoSaveOnClick ?? false,
```

In `updateSubscriptionSettings` insert `.values({...})` add:

```ts
        autoSaveOnClick: settings.autoSaveOnClick ?? false,
```

In `updateSubscriptionSettings` update `.set({...})` add:

```ts
      autoSaveOnClick: settings.autoSaveOnClick ?? existing.autoSaveOnClick,
```

In `getAllActiveSubscriptions` select object add:

```ts
      autoSaveOnClick: emailSubscriptions.autoSaveOnClick,
```

- [ ] **Step 4: Accept the field in the API (`app/api/settings/email/route.ts`)**

In `updateSchema` add:

```ts
  autoSaveOnClick: z.boolean().optional(),
```

(The GET already returns the full settings object via `sanitizeSettings`, so `autoSaveOnClick` flows out automatically.)

- [ ] **Step 5: Verify build + existing tests**

Run: `pnpm build && pnpm exec vitest run tests/`
Expected: PASS (no behavior change yet; types compile).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/ lib/email/queries.ts app/api/settings/email/route.ts
git commit -m "feat(email): persist autoSaveOnClick subscription setting"
```

---

### Task 10: Signed click-token util

**Files:**

- Create: `lib/email/click-token.ts`
- Test: `tests/email/click-token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/email/click-token.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { signClickToken, verifyClickToken } from "@/lib/email/click-token";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("click-token", () => {
  it("round-trips userId + articleId", () => {
    const t = signClickToken("user-1", "11111111-1111-4111-a111-000000000001");
    expect(verifyClickToken(t)).toEqual({ userId: "user-1", articleId: "11111111-1111-4111-a111-000000000001" });
  });
  it("handles userIds containing colons", () => {
    const t = signClickToken("a:b:c", "11111111-1111-4111-a111-000000000001");
    expect(verifyClickToken(t)).toEqual({ userId: "a:b:c", articleId: "11111111-1111-4111-a111-000000000001" });
  });
  it("rejects a tampered signature", () => {
    const t = signClickToken("user-1", "id-1");
    expect(verifyClickToken(t.slice(0, -2) + "xx")).toBeNull();
  });
  it("rejects malformed tokens", () => {
    expect(verifyClickToken("garbage")).toBeNull();
    expect(verifyClickToken("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/email/click-token.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// lib/email/click-token.ts
import { createHmac, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY env var is required for click tokens");
  return Buffer.from(raw, "base64");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(payload: string): string {
  return b64url(createHmac("sha256", key()).update(payload).digest());
}

/** Tamper-proof token encoding (userId, articleId). No URL is stored. */
export function signClickToken(userId: string, articleId: string): string {
  const payload = b64url(Buffer.from(`${userId}:${articleId}`, "utf8"));
  return `${payload}.${hmac(payload)}`;
}

export function verifyClickToken(token: string): { userId: string; articleId: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const decoded = fromB64url(payload).toString("utf8");
  const sep = decoded.lastIndexOf(":"); // articleId (uuid) has no colon
  if (sep <= 0) return null;
  const userId = decoded.slice(0, sep);
  const articleId = decoded.slice(sep + 1);
  if (!userId || !articleId) return null;
  return { userId, articleId };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/email/click-token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/click-token.ts tests/email/click-token.test.ts
git commit -m "feat(email): HMAC-signed click tokens for email links"
```

---

### Task 11: Article-url lookup query

**Files:**

- Modify: `lib/db/queries/articles.ts` (add `getArticleUrlById`)

- [ ] **Step 1: Implement (append near `getArticleById`)**

```ts
/** Look up an article's destination URL by id (no user scoping). */
export async function getArticleUrlById(articleId: string): Promise<string | null> {
  const [row] = await db
    .select({ url: articles.url })
    .from(articles)
    .where(eq(articles.id, articleId));
  return row?.url ?? null;
}
```

Ensure `articles` and `eq` are already imported in this file (they are — used by `getArticleById`).

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/articles.ts
git commit -m "feat(db): add getArticleUrlById lookup"
```

---

### Task 12: `/api/r` redirect endpoint

**Files:**

- Create: `app/api/r/route.ts`
- Test: `tests/api/r.test.ts`

- [ ] **Step 1: Write the failing test (mock the data layer + token)**

```ts
// tests/api/r.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/click-token", () => ({ verifyClickToken: vi.fn() }));
vi.mock("@/lib/db/queries/articles", () => ({ getArticleUrlById: vi.fn(), markArticle: vi.fn() }));

import { GET } from "@/app/api/r/route";
import { verifyClickToken } from "@/lib/email/click-token";
import { getArticleUrlById, markArticle } from "@/lib/db/queries/articles";

const APP = "http://localhost:3000";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = APP;
});

function req(t?: string) {
  return new Request(`http://localhost/api/r${t ? `?t=${t}` : ""}`);
}

describe("GET /api/r", () => {
  it("stars the article and redirects to its url on a valid token", async () => {
    vi.mocked(verifyClickToken).mockReturnValue({ userId: "u1", articleId: "art1" });
    vi.mocked(getArticleUrlById).mockResolvedValue("https://news.example/story");
    const res = await GET(req("tok"));
    expect(markArticle).toHaveBeenCalledWith("u1", "art1", { isStarred: true });
    expect(res.headers.get("location")).toBe("https://news.example/story");
  });

  it("redirects to app home on an invalid token and does not star", async () => {
    vi.mocked(verifyClickToken).mockReturnValue(null);
    const res = await GET(req("bad"));
    expect(markArticle).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(APP + "/");
  });

  it("redirects home when the article is unknown", async () => {
    vi.mocked(verifyClickToken).mockReturnValue({ userId: "u1", articleId: "missing" });
    vi.mocked(getArticleUrlById).mockResolvedValue(null);
    const res = await GET(req("tok"));
    expect(res.headers.get("location")).toBe(APP + "/");
  });

  it("still redirects to the article when starring fails", async () => {
    vi.mocked(verifyClickToken).mockReturnValue({ userId: "u1", articleId: "art1" });
    vi.mocked(getArticleUrlById).mockResolvedValue("https://news.example/story");
    vi.mocked(markArticle).mockRejectedValue(new Error("db down"));
    const res = await GET(req("tok"));
    expect(res.headers.get("location")).toBe("https://news.example/story");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm exec vitest run tests/api/r.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement**

```ts
// app/api/r/route.ts
import { NextResponse } from "next/server";
import { verifyClickToken } from "@/lib/email/click-token";
import { getArticleUrlById, markArticle } from "@/lib/db/queries/articles";

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const home = (process.env.NEXT_PUBLIC_APP_URL || reqUrl.origin).replace(/\/$/, "") + "/";

  const token = reqUrl.searchParams.get("t");
  const parsed = token ? verifyClickToken(token) : null;
  if (!parsed) return NextResponse.redirect(home);

  const url = await getArticleUrlById(parsed.articleId);
  if (!url) return NextResponse.redirect(home);

  try {
    await markArticle(parsed.userId, parsed.articleId, { isStarred: true });
  } catch (err) {
    console.error("[click] auto-save failed:", err);
  }
  return NextResponse.redirect(url);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm exec vitest run tests/api/r.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/r/route.ts tests/api/r.test.ts
git commit -m "feat(api): /api/r signed redirect that auto-stars on click"
```

---

### Task 13: Wire `buildLink` into the digest worker

**Files:**

- Modify: `lib/jobs/workers/digest-worker.ts` (`sendDigestForDate`)

- [ ] **Step 1: Implement the wiring**

At the top of `digest-worker.ts`, add imports:

```ts
import { signClickToken } from "@/lib/email/click-token";
import type { DigestArticle } from "@/lib/digest/types"; // already imported — keep single import
```

(`DigestArticle` is already imported on line 21; do not duplicate.)

In `sendDigestForDate`, replace the `const html = ...` line with:

```ts
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const buildLink =
    subscription.autoSaveOnClick && appUrl
      ? (a: DigestArticle) => `${appUrl}/api/r?t=${signClickToken(subscription.userId, a.id)}`
      : (a: DigestArticle) => a.url ?? "";

  const html =
    digest.mode === "clustered"
      ? renderDigestHtml(digest, buildLink)
      : renderFallbackHtml(digest);
```

(`subscription.autoSaveOnClick` is available because Task 9 added it to `getAllActiveSubscriptions`.)

- [ ] **Step 2: Verify build + full suite**

Run: `pnpm build && pnpm exec vitest run tests/`
Expected: PASS. Existing `digest-worker.test.ts` still green (it tests `assembleDigestForSubscription`, unaffected).

- [ ] **Step 3: Commit**

```bash
git add lib/jobs/workers/digest-worker.ts
git commit -m "feat(jobs): digest links auto-save when subscription opts in"
```

---

## Phase 4 — Settings Page (left section-nav)

### Task 14: Extract settings sections + nav layout + auto-save toggle

> UI refactor: no harness test framework for React components exists (vitest config includes only `tests/**/*.test.ts`, no jsdom/RTL). Verification = `pnpm build` + manual smoke. Keep all existing behavior and API calls byte-for-byte; only move JSX into section components and add the new toggle.

**Files:**

- Create: `components/settings/appearance-section.tsx`
- Create: `components/settings/feeds-section.tsx`
- Create: `components/settings/digest-email-section.tsx`
- Create: `components/settings/smart-digest-section.tsx`
- Create: `components/settings/account-section.tsx`
- Modify: `app/(reader)/settings/page.tsx` (becomes shell: data load + section nav)

- [ ] **Step 1: Extract sections (mechanical)**

For each section, move the corresponding `<Card>...</Card>` block from `settings/page.tsx` into a new component that receives the state + handlers it uses as props. Keep markup identical. Example shape:

```tsx
// components/settings/appearance-section.tsx
"use client";
import { Sun, Moon, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const themes = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

interface Props { theme?: string; mounted: boolean; onSelect: (key: string) => void; }

export function AppearanceSection({ theme, mounted, onSelect }: Props) {
  return (
    <Card className="rounded-2xl border-border/50">
      {/* ...existing Appearance card markup, using props... */}
    </Card>
  );
}
```

Repeat for `feeds-section.tsx` (subs, sync/OPML/list/interval/delete handlers), `digest-email-section.tsx` (emailSettings + SMTP + CronBuilder + feed select + test send), `smart-digest-section.tsx` (llm\* state + save/test), `account-section.tsx` (userAccount + save handlers). Pass each its state and the existing handler functions as props; the handlers stay defined in `page.tsx`.

- [ ] **Step 2: Add the auto-save toggle to `digest-email-section.tsx`**

Inside the Digest Email section, below the schedule block (only render when `emailSettings.enabled`), add a toggle mirroring the existing enable-toggle style:

```tsx
<div className="flex items-center justify-between border-t border-border/30 pt-4 mt-4">
  <div>
    <p className="text-sm font-medium">点击文章时自动收藏</p>
    <p className="text-xs text-muted-foreground">在邮件中点开文章后自动加入收藏夹</p>
  </div>
  <button
    type="button"
    onClick={() => onAutoSaveToggle(!(emailSettings?.autoSaveOnClick ?? false))}
    disabled={emailSaving}
    className={cn("w-11 h-6 rounded-full transition-colors relative",
      (emailSettings?.autoSaveOnClick ?? false) ? "bg-primary" : "bg-muted")}
  >
    <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
      (emailSettings?.autoSaveOnClick ?? false) ? "left-6" : "left-1")} />
  </button>
</div>
```

In `page.tsx`, add `autoSaveOnClick?: boolean` to the `EmailSettings` interface and an `onAutoSaveToggle` handler reusing the existing PUT pattern:

```tsx
async function handleAutoSaveToggle(autoSaveOnClick: boolean) {
  setEmailSaving(true);
  try {
    const res = await fetch("/api/settings/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoSaveOnClick }),
    });
    const data = await res.json();
    if (data.success && data.data) setEmailSettings(data.data);
  } finally {
    setEmailSaving(false);
  }
}
```

- [ ] **Step 3: Convert `page.tsx` body to left-nav + pane**

Keep all existing state, effects, and handler functions in `page.tsx`. Add:

```tsx
const SECTIONS = [
  { key: "appearance", label: "Appearance" },
  { key: "feeds", label: "Feeds" },
  { key: "digest", label: "Digest Email" },
  { key: "smart", label: "Smart Digest" },
  { key: "account", label: "Account" },
] as const;
const [active, setActive] = useState<(typeof SECTIONS)[number]["key"]>("appearance");
```

Replace the single `space-y-6` stack with: a desktop left rail (`hidden md:flex flex-col` of section buttons, active highlighted) + right pane that renders the active `*Section` component; on mobile, render a `<select>` bound to `active` above the pane. Pass the relevant props/handlers to each section.

- [ ] **Step 4: Verify build + manual smoke**

Run: `pnpm build`
Expected: compiles. Manual: open `/settings`, switch sections, toggle "点击文章时自动收藏" and confirm it persists (GET returns it). Confirm theme/feeds/SMTP/LLM/account all still work.

- [ ] **Step 5: Commit**

```bash
git add app/\(reader\)/settings/page.tsx components/settings/
git commit -m "refactor(settings): left section-nav layout + auto-save toggle"
```

---

## Final Verification

- [ ] `pnpm exec vitest run tests/` — all green.
- [ ] `pnpm build` — passes.
- [ ] Migration applied (`auto_save_on_click` present).
- [ ] Manual: send a test digest with Smart Digest on → email shows TOP STORIES + multiple distinct events per topic, title+brief, no images, no expanders. With auto-save on, clicking a link stars the article and lands on the source.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** ① clustering accuracy → Tasks 1-6; ② layout A → Tasks 7-8; ③ click-to-auto-save → Tasks 9-13; ④ settings slimming → Task 14. All spec sections mapped.
- **Placeholders:** none — every code/test step has concrete content. (Task 14 is an intentional mechanical-move task with concrete shells + the only new logic shown in full; UI has no harness test framework, stated honestly.)
- **Type consistency:** `Cluster` reused from `cluster-types.ts`; `consolidateClusters` composition matches the helper signatures; `renderDigestHtml(digest, buildLink?)` LinkFn matches worker usage; `signClickToken/verifyClickToken` shapes match `/api/r` + worker; `autoSaveOnClick` name consistent across schema, queries, route, worker, settings.
