# Digest LLM Clustering — Design Spec

**Date:** 2026-05-19
**Status:** Approved (brainstorming)
**Scope:** Optimize feedwise daily digest email so users can see top-priority items first, grouped by topic, with cross-source duplicates collapsed.

---

## 1. Problem

Current digest renders all articles since the last send in publish-time order. With many feeds this produces emails that are:

- Overwhelming in total volume
- Lacking importance/heat ranking
- Lacking topic/category grouping
- Full of cross-source duplicates (HN + V2EX + Twitter all carrying the same story)

Goal: reorganize the same set of articles (no hiding) into top-headlines + topic-grouped sections with duplicate sources collapsed, while keeping a clean fallback when LLM is not available.

## 2. Constraints (locked in brainstorming)

- **Scope:** existing RSS only. Do not add trending sources (HN/Reddit/GitHub Trending) in this iteration.
- **No article hiding.** Every input article must appear in the output digest somewhere.
- **LLM allowed only inside digest generation.** Web reader stays AI-free. This relaxes the previous "no AI" project direction memory specifically for digest.
- **OpenAI-compatible LLM only.** User configures `baseUrl + apiKey + model` themselves.
- **LLM is optional.** If user has not enabled/configured it, digest falls back to current behavior.
- **All secret fields encrypted at rest** (`smtpPass`, `emailApiKey`, `llmApiKey`) — this PR's scope expanded to include the two pre-existing fields for consistency.
- **`ENCRYPTION_KEY` env var required at startup.** Fail fast if missing.
- **Top headlines fixed at 5.** Pad by importance descending if fewer than 5 clusters meet `importance >= 8`.
- **Topic count <= 8** enforced via prompt.
- **Headline language: always English**, regardless of source language.
- **`importance >= 8` clusters <= 5** enforced via prompt.
- **LLM timeout: 30 s**; any failure path falls back, never blocks sending.
- **`markArticlesAsSent` uses the original article id array** (pre-dedupe), so collapsed duplicates are not re-sent next cycle.

## 3. Architecture

```
lib/digest/
  normalize-url.ts        URL canonicalization (strip utm/fbclid/ref, fragments, trailing slash)
  dedupe.ts               Rule-based dedupe: URL canonical + title Jaccard similarity
  llm-client.ts           OpenAI-compatible client (fetch wrapper, 30s timeout, typed errors)
  cluster.ts              Prompt assembly -> LLM call -> schema validation -> Cluster[]
  cluster-types.ts        Zod schema + inferred TS types
  organize.ts             Compose dedupe + cluster output into OrganizedDigest view model
  fallback.ts             Produce OrganizedDigest in fallback mode (single pseudo-cluster)

lib/email/
  sender.ts               unchanged
  queries.ts              unchanged
  templates/
    digest.tsx            rewrite: render OrganizedDigest
    digest-fallback.tsx   preserves current template

lib/crypto/
  secrets.ts              AES-256-GCM encrypt/decrypt for stored secrets

lib/jobs/workers/
  digest-worker.ts        wire the new pipeline into sendDigestForDate()

app/(reader)/settings/email/
  llm-config-section.tsx  Smart Digest (Beta) settings card

app/api/email/llm/
  config/route.ts         PUT — save config
  test/route.ts           POST — ping current form values

drizzle/scripts/
  encrypt-existing-secrets.ts   one-time idempotent migration for existing rows
```

**Dependency direction (one-way):** `digest-worker` -> `organize` -> `cluster` -> `llm-client` + `dedupe` + `normalize-url`. Email templates depend only on the `OrganizedDigest` view model, never on LLM or DB directly.

## 4. Pipeline data flow

`digest-worker.sendDigestForDate(subscription, triggerDate, fromDate)`:

```
[1] getArticlesForEmail(userId, fromDate, triggerDate)            -> Article[]
[2] dedupe.byCanonicalUrl(articles)                               -> Article[]
[3] dedupe.byTitleSimilarity(articles, threshold=0.85)            -> DedupedArticle[]
[4] if !llmConfig.enabled -> fallback.organize(deduped)            -> OrganizedDigest
[5] cluster.run(deduped, llmConfig)
        on timeout/parse-error/schema-error -> fallback.organize(deduped)
[6] organize.assemble(deduped, clusters)                          -> OrganizedDigest
[7] renderEmail(OrganizedDigest)                                  -> html
[8] sendDailyDigest({ to, subject, html, smtpConfig })            (existing)
[9] markArticlesAsSent(userId, ORIGINAL articles.map(a => a.id))  (existing query)
```

### Invariants

- **No article loss.** Every input article id must appear in `OrganizedDigest.topHeadlines` / `topicGroups` / `ungrouped` exactly once. Enforced by property test (fast-check).
- **LLM failure never blocks send.** Digest always goes out; only the organization quality degrades.
- **`markArticlesAsSent` receives the pre-dedupe array.** Collapsed duplicates count as sent.

### Failure handling

| Failure                                | Behavior                                                         |
| -------------------------------------- | ---------------------------------------------------------------- |
| LLM network/timeout (30 s)             | catch -> fallback                                                |
| LLM returns non-JSON                   | catch JSON.parse -> fallback                                     |
| LLM returns JSON failing Zod schema    | safeParse fail -> fallback                                       |
| LLM returns unknown article ids        | filter unknowns, remaining articles -> `ungrouped`               |
| Zero candidate articles                | skip LLM, send current "No new articles" email                   |
| Secret decryption fails                | throw `SecretDecryptionError`, fallback for LLM, log for SMTP    |

## 5. LLM schema and prompt

### Zod schema (`lib/digest/cluster-types.ts`)

```ts
import { z } from "zod";

export const ClusterSchema = z.object({
  topic: z.string().min(1).max(40),
  headline: z.string().min(1).max(120),
  importance: z.number().int().min(1).max(10),
  articleIds: z.array(z.string().uuid()).min(1),
});

export const ClusterResponseSchema = z.object({
  clusters: z.array(ClusterSchema).max(50),
});

export type Cluster = z.infer<typeof ClusterSchema>;
export type ClusterResponse = z.infer<typeof ClusterResponseSchema>;
```

JSON Schema for OpenAI `response_format` derived via `zod-to-json-schema`. If the configured endpoint rejects strict json_schema, fall back to `json_object` mode + Zod validation.

### Prompt

System prompt (stable, cache-friendly):

```
You are an RSS digest assistant. Cluster the candidate articles by topic,
rank them by importance, and produce a concise English headline per cluster.

Rules:
1. Merge articles describing the same event/topic into one cluster,
   even when sources, wording, or languages differ.
2. `topic` is a broad category (<= 40 chars, e.g. "AI", "Open Source",
   "Geopolitics", "Web Dev"). Reuse the same string for related clusters.
3. Total distinct topics MUST be <= 8.
4. `headline` is one English sentence summarizing the event, <= 120 chars,
   no emoji. English even when sources are in other languages.
5. `importance` is 1-10. Wide coverage, broad impact, time-sensitive -> high.
   Niche personal blog or promo -> low. AT MOST 5 clusters may have
   importance >= 8.
6. Each article must belong to exactly one cluster. Single-article clusters
   are allowed.
7. Return ONLY JSON matching the provided schema.
```

User prompt (per-call):

```
Today's candidate articles (N items):
[
  {"id":"<uuid>","title":"...","summary":"<first 200 chars>","source":"<feed title>"},
  ...
]
Return clusters per schema.
```

### Token budget

| Articles | Input tokens | Output tokens | Approx cost (Haiku-class) |
| -------- | ------------ | ------------- | ------------------------- |
| 50       | ~6k          | ~1k           | < $0.001                  |
| 200      | ~24k         | ~4k           | ~$0.005                   |
| 500      | ~60k         | ~10k          | ~$0.015                   |

Batching: when candidate count > 150, slice by `publishedAt` descending into batches of <= 150, cluster each batch independently, then merge across batches:
- Group resulting clusters by `topic.toLowerCase().trim()`.
- For each merge group: concatenate `articleIds`, keep `headline` from the highest-importance member, set merged `importance` to the max of members.
- After merge, if total distinct topics > 8, fold the lowest-importance topics into a single "Other" topic.

### Fallback marker

When fallback path runs, return a single pseudo-cluster:
```ts
{ topic: "All", headline: "", importance: 5, articleIds: [...all input ids] }
```
Templates detect this via `OrganizedDigest.mode` rather than inspecting the cluster, so the rendering path stays clean.

## 6. Email template layout

```
+----------------------------------------------------------+
|  Feedwise Digest - May 19 - 87 articles - 12 topics      |  header
+----------------------------------------------------------+
|  TOP HEADLINES                                           |  section 1
|  -------------                                           |
|  (1) OpenAI ships GPT-5.5 ...        AI · 6 src · ★ 9    |
|  (2) EU AI Act phase-2 ...          Geo · 4 src · ★ 9    |
|  (3) Bun 2.0 cuts cold start 40%    Web · 3 src · ★ 8    |
|  (4) ...                                                 |
|  (5) ...                                                 |
+----------------------------------------------------------+
|  AI                                              (24)    |  section 2
|  --                                                      |
|  > OpenAI ships GPT-5.5 ...                              |
|    The Verge · Ben Smith · 2h ago                        |
|    A short summary line ...                              |
|    [+5 other sources v]                                  |
|  > Anthropic adds memory tier ...                        |
|  Open Source                                     (15)    |
|  -----------                                             |
|  Web Dev                                         (18)    |
|  -------                                                 |
+----------------------------------------------------------+
|  Ungrouped                                        (3)    |  section 3
|  > ...                                                   |
+----------------------------------------------------------+
|  Manage feeds · Settings · Unsubscribe                   |  footer
+----------------------------------------------------------+
```

### Rendering rules

| Element                    | Implementation                                            |
| -------------------------- | --------------------------------------------------------- |
| Numeric markers (1)(2)...  | Static ASCII, no images                                   |
| `★ 9` importance           | Text + emoji (cross-client safe, no SVG)                  |
| `[+5 other sources v]`     | `<details><summary>` (graceful degrade: always-expanded)  |
| Topic header count         | Total articles in topic (includes folded duplicates)      |
| Top headline anchors       | `<a href="#topic-ai">` to topic section                   |
| Color                      | Black/gray + one accent; client controls theme            |
| Images                     | Cluster primary's `imageUrl`, max-width 100%, max-h 320px |
| Type sizes                 | Title 16px, body 14px, meta 12px                          |

### Fallback template

`digest-fallback.tsx` is identical to current template. The only extra: when `mode === "fallback-llm-failed"`, header shows a small line `Topic clustering unavailable for this digest.`. When `mode === "fallback-no-config"`, no such line (avoids noise for users who never opted in).

### View model contract

```ts
interface OrganizedDigest {
  date: Date;
  totalArticles: number;
  topicCount: number;
  topHeadlines: Array<{
    cluster: Cluster;
    primaryArticle: Article;
    sourceCount: number;
  }>;
  topicGroups: Array<{
    topic: string;
    totalCount: number;
    clusters: Array<{
      cluster: Cluster;
      primary: Article;
      duplicates: Article[];
    }>;
  }>;
  ungrouped: Article[];
  mode: "clustered" | "fallback-no-config" | "fallback-llm-failed";
}
```

Templates read only this object, never LLM responses or DB directly.

## 7. Data model and configuration

### Schema additions (`lib/db/schema.ts` -> `emailSubscriptions`)

```ts
llmEnabled: boolean("llm_enabled").notNull().default(false),
llmBaseUrl: varchar("llm_base_url", { length: 500 }),
llmApiKey: text("llm_api_key"),         // encrypted ciphertext
llmModel: varchar("llm_model", { length: 100 }),
```

All nullable / defaulted -> existing rows unaffected.

### Secret encryption (`lib/crypto/secrets.ts`)

- AES-256-GCM
- Key source: env `ENCRYPTION_KEY` (32 bytes base64-encoded)
- Startup validation: app refuses to boot if `ENCRYPTION_KEY` is missing or wrong length (fail fast)
- Ciphertext format: `v1:{iv-base64}:{ciphertext-base64}:{authTag-base64}`
- API: `encryptSecret(plaintext: string): string`, `decryptSecret(stored: string): string`
- Errors: `SecretDecryptionError` thrown on auth-tag mismatch / format error

### Encryption coverage (this PR)

All three secret fields encrypted at rest:
- `email_subscriptions.smtp_pass`
- `email_subscriptions.email_api_key`
- `email_subscriptions.llm_api_key`

DB column types stay `text`. Version prefix `v1:` distinguishes encrypted from legacy plaintext for idempotent migration.

### Migration

Drizzle migration:
```sql
ALTER TABLE email_subscriptions
  ADD COLUMN llm_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN llm_base_url varchar(500),
  ADD COLUMN llm_api_key text,
  ADD COLUMN llm_model varchar(100);
```

One-time script `drizzle/scripts/encrypt-existing-secrets.ts`:
- Scans `smtp_pass`, `email_api_key` for rows whose value does not start with `v1:`
- Encrypts in place
- Idempotent: re-running is a no-op
- Run as part of deploy steps; documented in README

### Configuration UI (`app/(reader)/settings/email/llm-config-section.tsx`)

New card below cron config:

```
+- Smart Digest (Beta) ---------------------------+
|  [ ] Enable LLM clustering                      |
|                                                 |
|  When on, your digest is grouped by topic and   |
|  ranked by importance. Uses your own            |
|  OpenAI-compatible API. Off by default.         |
|                                                 |
|  API Base URL                                   |
|  [ https://api.openai.com/v1            ]       |
|                                                 |
|  API Key                                        |
|  [ sk-........                          ] [Test]|
|                                                 |
|  Model                                          |
|  [ gpt-4o-mini                          ]       |
|                                                 |
|  [ Save ]                                       |
+-------------------------------------------------+
```

Interaction:
- API Key field `type="password"`. Stored secrets render as masked (`sk-1234...wxyz`), never plaintext.
- `[Test]` -> POST `/api/email/llm/test` runs minimal chat completion (`reply with the word OK`). Request body sends the API key from the current form input. If the field is untouched (masked placeholder), the server uses the stored encrypted key for this user instead. The masked placeholder string is never used as a real key.
- Toggle off -> immediate effect, next digest uses fallback.
- React 19 `useActionState` + Server Action (matches project conventions).

### API endpoints

| Path                       | Method | Purpose                                              |
| -------------------------- | ------ | ---------------------------------------------------- |
| `/api/email/llm/config`    | PUT    | Save baseUrl/key/model/enabled (key encrypted on write) |
| `/api/email/llm/test`      | POST   | Ping with current form values, do not persist        |

## 8. Testing strategy

Coverage targets: new files >= 90%, modified files >= 80%. Stack: Vitest + @testing-library/react + Playwright + fast-check.

### Test matrix

| File                                 | Type             | Key cases                                                                                                                                       |
| ------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/crypto/secrets.ts`              | unit             | roundtrip; wrong key -> SecretDecryptionError; format validation; v1 prefix detection; missing ENCRYPTION_KEY at import -> throw                |
| `lib/digest/normalize-url.ts`        | unit             | strip utm/fbclid/ref; strip fragment; trailing slash; case-normalize host; invalid url                                                          |
| `lib/digest/dedupe.ts`               | unit             | exact URL merge; Jaccard 0.84 not merged / 0.85 merged; empty/single input; primary = earliest publishedAt                                      |
| `lib/digest/llm-client.ts`           | unit (mock fetch)| 30s timeout fires; 429 -> RateLimitError; bad JSON -> LlmParseError; missing config -> LlmNotConfiguredError; request body includes `response_format` |
| `lib/digest/cluster.ts`              | unit (mock llm)  | prompt contains <=8-topic + importance-cap text; batching kicks in > 150; cross-batch topic merge; unknown article ids filtered                 |
| `lib/digest/cluster-types.ts`        | unit             | Zod rejects missing/oversize/non-uuid; ClusterResponse max 50                                                                                   |
| `lib/digest/organize.ts`             | unit             | property test (fast-check): all input ids present in output; Top 5 selection; padding when fewer than 5 importance>=8                           |
| `lib/digest/fallback.ts`             | unit             | mode set correctly for `fallback-no-config` / `fallback-llm-failed`; single pseudo-cluster contains all ids                                     |
| `lib/email/templates/digest.tsx`     | snapshot         | 3 fixtures: clustered / fallback-no-config / fallback-llm-failed                                                                                |
| `lib/email/templates/digest-fallback.tsx` | snapshot    | 1 fixture                                                                                                                                       |
| `lib/jobs/workers/digest-worker.ts`  | integration      | mock DB + LLM + SMTP: LLM success path passes ORIGINAL ids to markArticlesAsSent; LLM failure still sends; disabled LLM never calls llm-client  |
| `app/api/email/llm/test/route.ts`    | integration      | success 200; timeout 504; decryption failure 500                                                                                                |
| Settings UI                          | Playwright E2E   | enable -> fill -> Test -> Save -> reopen shows masked key                                                                                       |

### Fixtures

```
tests/fixtures/digest/
  articles-50-hn-techcrunch-overlap.json
  articles-200-mixed.json
  llm-response-clustered.json
  llm-response-malformed.json
  organized-digest-clustered.json
  organized-digest-fallback.json
```

### Critical invariant test

```ts
test("invariant: every input article appears in OrganizedDigest", () => {
  fc.assert(fc.property(
    arbitraryArticles(),
    arbitraryClusterResponse(),
    (articles, clusterResponse) => {
      const out = organize(articles, clusterResponse);
      const all = new Set([
        ...out.topHeadlines.map(h => h.primaryArticle.id),
        ...out.topicGroups.flatMap(g =>
          g.clusters.flatMap(c => [c.primary.id, ...c.duplicates.map(d => d.id)])
        ),
        ...out.ungrouped.map(a => a.id),
      ]);
      expect(all.size).toBe(articles.length);
      articles.forEach(a => expect(all.has(a.id)).toBe(true));
    }
  ));
});
```

## 9. Rollback strategy

| Layer            | Rollback                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Schema           | All new columns nullable / defaulted -> `DROP COLUMN` is safe; old data untouched                                     |
| Secrets          | Encrypt-migration is idempotent. Inverse-decrypt script can be added if needed, also keyed on `v1:` prefix detection  |
| LLM calls        | Per-user toggle off via DB update -> instant fallback for affected users without redeploy                             |
| Template         | Fallback template kept; force `mode = "fallback-no-config"` in worker for kill-switch                                 |
| Encryption key   | Compromise scenario: rotate key, re-encrypt all rows with new `v2:` prefix in a follow-up migration                   |

## 10. Gradual rollout

- `llmEnabled` defaults to `false` -> existing users see zero behavior change after upgrade
- User opt-in via Smart Digest (Beta) card = natural per-user canary
- After 2 weeks, evaluate cost/quality and decide whether to promote out of Beta or add server-side defaults

## 11. Out of scope (deferred)

- HN/Reddit/GitHub Trending integration as new feed sources
- Embedding-based clustering (a heavier two-stage pipeline)
- Persisting clusters to DB for "digest history" page
- Encryption key rotation tooling (deferred; `v1:` prefix allows future `v2:` rotation)
- Per-user LLM cost/usage dashboard
- Customizable topic taxonomy
- Multi-language headline preference (current decision: English only)

## 12. Open dependencies to verify before implementation

- `pnpm test` script configuration: confirm whether Vitest is to be added fresh or replaces an existing runner
- `zod-to-json-schema` package availability vs hand-derived JSON schema
- Whether project already has any encryption utility we should extend instead of new `lib/crypto/secrets.ts`
- Confirm `openai` SDK vs hand-rolled fetch in `llm-client.ts` (preference is hand-rolled fetch for smaller surface area, but check existing deps)
