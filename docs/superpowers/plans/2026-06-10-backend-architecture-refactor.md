# Backend Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 6 backend architecture candidates (dead code, LLM config placement, email/queries god module, digest atomicity, LLM enrichment seam, feed ingestion) AND enforce the hard rule: *for users with auto-tag enabled, a digest must not be sent until every candidate article has been through tagging*.

**Architecture:** Move LLM config into `lib/digest/` (where the LLM client lives); split `lib/email/queries.ts` (626 lines, 4 domains) into three domain modules; make the digest "record sent" step a single transaction; introduce a deep `tagUserArticles` module reused by both the background worker and a new digest tag-gate; extract feed ingestion into `lib/feeds/ingest.ts` with a transaction; add a `withAuth` wrapper to kill 80+ lines of route boilerplate.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM + PostgreSQL, BullMQ, Vitest (`pnpm test`), `pnpm build` for verification.

**Out of scope (separate plan):** Reader UI refactor (shared data-fetch hook, app-sidebar split) — Plan B after this plan lands.

**Conventions for all tasks:**
- Work on branch `refactor/architecture-deepening`.
- Conventional commits, NO attribution footer (user has attribution disabled globally).
- After each task: `pnpm test` and `pnpm build` must pass before commit.
- This is Next.js 16 with breaking changes — before touching any route handler signature, check `node_modules/next/dist/docs/` for the current route handler conventions.
- Path alias `@/` maps to repo root.

---

### Task 1: Delete the dead LLM clustering pipeline

The production digest uses `buildTagBasedDigest` (lib/digest/organize-by-tag.ts). The old synchronous-LLM pipeline is dead: `lib/digest/cluster.ts` and `lib/digest/organize.ts` are imported ONLY by their tests; `lib/digest/consolidate.ts` is imported only by the dead `cluster.ts` and its test. NOTE: `lib/digest/fallback.ts` is LIVE (used by `app/api/settings/email/test/route.ts`) — do NOT delete it. `lib/digest/cluster-types.ts` is LIVE (`lib/digest/types.ts` imports `Cluster` from it) — do NOT delete it.

**Files:**
- Delete: `lib/digest/cluster.ts`
- Delete: `lib/digest/organize.ts`
- Delete: `lib/digest/consolidate.ts`
- Delete: `tests/digest/cluster.test.ts`
- Delete: `tests/digest/organize.test.ts`
- Delete: `tests/digest/consolidate.test.ts`

- [ ] **Step 1: Re-verify the files are dead before deleting**

Run: `grep -rn --include="*.ts" --include="*.tsx" -E "digest/(cluster|organize|consolidate)\"" app lib components tests | grep -v "organize-by-tag" | grep -v "cluster-types"`
Expected output: ONLY hits in `lib/digest/cluster.ts` itself (imports consolidate) and in the three test files being deleted. If any `app/` or other `lib/` file appears, STOP and report.

- [ ] **Step 2: Delete the six files**

```bash
rm lib/digest/cluster.ts lib/digest/organize.ts lib/digest/consolidate.ts
rm tests/digest/cluster.test.ts tests/digest/organize.test.ts tests/digest/consolidate.test.ts
```

- [ ] **Step 3: Verify build and tests**

Run: `pnpm build && pnpm test`
Expected: build passes, all remaining tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(digest): delete dead LLM clustering pipeline (cluster/organize/consolidate)"
```

---

### Task 2: Move LLM config from lib/email/queries.ts to lib/digest/llm-config.ts

`LlmConfig` + its accessors live in the email queries module but are consumed by digest, feeds, articles and jobs code. Move them next to the LLM client. Also note `lib/digest/llm-client.ts` already exports an identical `LlmFormat` type — the new module re-uses it instead of redefining.

**Files:**
- Create: `lib/digest/llm-config.ts`
- Modify: `lib/email/queries.ts` (remove lines 545–626: `LlmFormat`, `LlmConfig`, `getUserLlmConfig`, `LlmConfigInput`, `updateUserLlmConfig`; remove lines 356–372: `getUsersWithAutoTagEnabled`, `getUsersWithAutoSummarizeEnabled`)
- Modify importers (exact list in Step 3)

- [ ] **Step 1: Create `lib/digest/llm-config.ts`**

```typescript
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscriptions } from "@/lib/db/schema";
import { encryptSecret, decryptIfEncrypted } from "@/lib/crypto/secrets";
import type { LlmFormat } from "@/lib/digest/llm-client";

export type { LlmFormat };

export interface LlmConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  format: LlmFormat;
  autoSummarize: boolean;
  autoTag: boolean;
}

export interface LlmConfigInput {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  format?: LlmFormat;
  autoSummarize?: boolean;
  autoTag?: boolean;
}

async function getSubscriptionRow(userId: string) {
  const [sub] = await db
    .select()
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.userId, userId));
  return sub ?? null;
}

export async function getUserLlmConfig(userId: string): Promise<LlmConfig | null> {
  const sub = await getSubscriptionRow(userId);
  if (!sub || !sub.llmEnabled || !sub.llmBaseUrl || !sub.llmApiKey || !sub.llmModel) {
    return null;
  }
  let apiKey = "";
  try {
    apiKey = decryptIfEncrypted(sub.llmApiKey) ?? "";
  } catch {
    // Decryption failed (key rotated or corrupted) — surface as no config
    return null;
  }
  return {
    enabled: true,
    baseUrl: sub.llmBaseUrl,
    apiKey,
    model: sub.llmModel,
    format: (sub.llmFormat as LlmFormat) ?? "openai",
    autoSummarize: sub.autoSummarize ?? true,
    autoTag: sub.autoTag ?? false,
  };
}

export async function updateUserLlmConfig(userId: string, input: LlmConfigInput): Promise<void> {
  const existing = await getSubscriptionRow(userId);
  const apiKeyToStore =
    input.apiKey === undefined
      ? (existing?.llmApiKey ?? null)
      : input.apiKey === ""
        ? null
        : encryptSecret(input.apiKey);

  if (!existing) {
    await db.insert(emailSubscriptions).values({
      userId,
      enabled: false,
      llmEnabled: input.enabled,
      llmBaseUrl: input.baseUrl || null,
      llmApiKey: apiKeyToStore,
      llmModel: input.model || null,
      llmFormat: input.format ?? "openai",
      ...(input.autoSummarize !== undefined ? { autoSummarize: input.autoSummarize } : {}),
      ...(input.autoTag !== undefined ? { autoTag: input.autoTag } : {}),
    });
    return;
  }
  await db
    .update(emailSubscriptions)
    .set({
      llmEnabled: input.enabled,
      llmBaseUrl: input.baseUrl || null,
      llmApiKey: apiKeyToStore,
      llmModel: input.model || null,
      llmFormat: input.format ?? existing.llmFormat ?? "openai",
      ...(input.autoSummarize !== undefined ? { autoSummarize: input.autoSummarize } : {}),
      ...(input.autoTag !== undefined ? { autoTag: input.autoTag } : {}),
      updatedAt: new Date(),
    })
    .where(eq(emailSubscriptions.id, existing.id));
}

export async function getUsersWithAutoTagEnabled(): Promise<string[]> {
  const rows = await db
    .select({ userId: emailSubscriptions.userId })
    .from(emailSubscriptions)
    .where(and(eq(emailSubscriptions.autoTag, true), eq(emailSubscriptions.llmEnabled, true)));
  return rows.map((r) => r.userId);
}

export async function getUsersWithAutoSummarizeEnabled(): Promise<string[]> {
  const rows = await db
    .select({ userId: emailSubscriptions.userId })
    .from(emailSubscriptions)
    .where(
      and(eq(emailSubscriptions.autoSummarize, true), eq(emailSubscriptions.llmEnabled, true)),
    );
  return rows.map((r) => r.userId);
}
```

- [ ] **Step 2: Remove the moved code from `lib/email/queries.ts`**

Delete from `lib/email/queries.ts`: the `LlmFormat` type, `LlmConfig` interface, `LlmConfigInput` interface, `getUserLlmConfig`, `updateUserLlmConfig`, `getUsersWithAutoTagEnabled`, `getUsersWithAutoSummarizeEnabled`. Everything else stays (it is split in Task 3).

- [ ] **Step 3: Update importers**

Find every importer: `grep -rln "@/lib/email/queries" app lib tests`. For each file, move ONLY the LLM-related named imports (`LlmConfig`, `LlmConfigInput`, `LlmFormat`, `getUserLlmConfig`, `updateUserLlmConfig`, `getUsersWithAutoTagEnabled`, `getUsersWithAutoSummarizeEnabled`) to `@/lib/digest/llm-config`; keep other named imports pointing at `@/lib/email/queries`. Known affected files:

- `lib/articles/enrichment.ts` — `import type { LlmConfig } from "@/lib/email/queries"` → `"@/lib/digest/llm-config"`
- `lib/feeds/auto-group.ts` — same change
- `lib/jobs/workers/enrichment-worker.ts` — `getUsersWithAutoTagEnabled, getUsersWithAutoSummarizeEnabled, getUserLlmConfig` → new path
- `app/api/search/ai/route.ts` — `getUserLlmConfig` → new path
- `app/api/articles/[id]/summarize/route.ts`, `app/api/articles/[id]/tag-suggestions/route.ts` — LLM imports → new path
- `app/api/email/llm/config/route.ts`, `app/api/email/llm/models/route.ts`, `app/api/email/llm/preview/route.ts`, `app/api/email/llm/test/route.ts` — LLM imports → new path
- `app/api/feeds/auto-group/route.ts` — LLM imports → new path
- Any test that mocks LLM functions on `@/lib/email/queries` must now mock `@/lib/digest/llm-config` instead (check `tests/api/*.test.ts`, `tests/email/*.test.ts`).

- [ ] **Step 4: Verify**

Run: `grep -rn "getUserLlmConfig\|LlmConfig" app lib tests | grep "email/queries"`
Expected: no output.
Run: `pnpm build && pnpm test`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(digest): move LLM config out of email/queries into lib/digest/llm-config"
```

---

### Task 3: Split lib/email/queries.ts into three domain modules

After Task 2, `lib/email/queries.ts` still mixes subscription settings, digest article selection, and digest history. Split it; delete the original file (no re-export barrel).

**Files:**
- Create: `lib/email/subscription-settings.ts` — `encryptIfPresent` (private), `SubscriptionSettings`, `SMTPConfig`, `getUserSubscription`, `getSubscriptionSettings`, `updateSubscriptionSettings`, `syncSubscriptionEntities` (private), `updateNextScheduledAt`, `getAllActiveSubscriptions`, `markDigestSent`, `getUserSMTPConfig`, `getUserEmail`
- Create: `lib/email/digest-articles.ts` — `getArticlesForEmail`, `markArticlesAsSent` (imports `getSubscriptionSettings` from `./subscription-settings`)
- Create: `lib/email/digest-log.ts` — `logDigestSend`, `logDigestSendWithArticles`, `getLastDigestSentDate`, `getDigestHistory`, `getDigestLogById`, `getArticlesForLog`
- Delete: `lib/email/queries.ts`
- Modify: every remaining importer (Step 3)

- [ ] **Step 1: Create the three modules by moving code verbatim**

Move each function listed above with its current implementation unchanged. Each new file imports only the drizzle tables/operators it actually uses. `digest-articles.ts` keeps the `EmailArticle` import: `import type { EmailArticle } from "./sender";`.

- [ ] **Step 2: Delete `lib/email/queries.ts`**

- [ ] **Step 3: Update all importers**

Run `grep -rln "@/lib/email/queries" app lib tests` and fix every hit. Mapping:

| Symbol | New module |
|---|---|
| `getUserSubscription`, `getSubscriptionSettings`, `updateSubscriptionSettings`, `updateNextScheduledAt`, `getAllActiveSubscriptions`, `markDigestSent`, `getUserSMTPConfig`, `getUserEmail`, `SubscriptionSettings`, `SMTPConfig` | `@/lib/email/subscription-settings` |
| `getArticlesForEmail`, `markArticlesAsSent` | `@/lib/email/digest-articles` |
| `logDigestSend`, `logDigestSendWithArticles`, `getLastDigestSentDate`, `getDigestHistory`, `getDigestLogById`, `getArticlesForLog` | `@/lib/email/digest-log` |

Known importers: `lib/jobs/workers/digest-worker.ts`, `app/api/settings/email/route.ts`, `app/api/settings/email/test/route.ts`, `app/api/settings/email/history/route.ts`, `app/api/settings/email/history/[logId]/preview/route.ts`, `app/api/settings/email/history/[logId]/resend/route.ts`, `app/api/r/route.ts`, plus tests `tests/email/queries-history.test.ts`, `tests/api/email-history-preview.test.ts`, `tests/api/email-history-resend.test.ts`, `tests/api/r.test.ts` (update both their imports AND their `vi.mock("@/lib/email/queries", ...)` calls to mock the new module paths — split one `vi.mock` into multiple if a test uses symbols from different new modules).

- [ ] **Step 4: Verify**

Run: `grep -rn "email/queries" app lib tests components`
Expected: no output.
Run: `pnpm build && pnpm test`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(email): split queries god module into subscription-settings, digest-articles, digest-log"
```

---

### Task 4: Make the digest "record sent" step atomic

Today `sendDigestForDate` does `markArticlesAsSent` then `logDigestSendWithArticles` as separate writes — a crash between them leaves articles marked sent with no log (so `getLastDigestSentDate` stays old and articles can be re-queried but are excluded → silently dropped from future digests is NOT the failure; the failure is inconsistent state). Wrap both in one transaction via a new `recordDigestSent`.

**Files:**
- Modify: `lib/email/digest-log.ts` (add `recordDigestSent`)
- Modify: `lib/jobs/workers/digest-worker.ts` (use it)
- Test: `tests/email/record-digest-sent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/email/record-digest-sent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emailSentArticles, emailDigestLogs, emailDigestLogArticles } from "@/lib/db/schema";

const h = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const tx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return {
          onConflictDoNothing: async () => undefined,
          returning: async () => [{ id: "log-1" }],
        };
      },
    }),
  };
  const transaction = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
  return { inserts, transaction };
});

vi.mock("@/lib/db", () => ({ db: { transaction: h.transaction } }));

import { recordDigestSent } from "@/lib/email/digest-log";

beforeEach(() => {
  h.inserts.length = 0;
  h.transaction.mockClear();
});

describe("recordDigestSent", () => {
  it("writes sent-markers, log, and log-articles inside ONE transaction", async () => {
    const logId = await recordDigestSent("user-1", ["a1", "a2"], 2);
    expect(logId).toBe("log-1");
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.inserts.map((i) => i.table)).toEqual([
      emailSentArticles,
      emailDigestLogs,
      emailDigestLogArticles,
    ]);
    expect(h.inserts[0].values).toEqual([
      expect.objectContaining({ userId: "user-1", articleId: "a1" }),
      expect.objectContaining({ userId: "user-1", articleId: "a2" }),
    ]);
    expect(h.inserts[2].values).toEqual([
      expect.objectContaining({ logId: "log-1", articleId: "a1" }),
      expect.objectContaining({ logId: "log-1", articleId: "a2" }),
    ]);
  });

  it("with no articles, writes only the log row", async () => {
    await recordDigestSent("user-1", [], 0);
    expect(h.inserts.map((i) => i.table)).toEqual([emailDigestLogs]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/email/record-digest-sent.test.ts`
Expected: FAIL — `recordDigestSent` is not exported.

- [ ] **Step 3: Implement `recordDigestSent` in `lib/email/digest-log.ts`**

```typescript
/**
 * Atomically record a successful digest send: mark articles as sent, write
 * the digest log, and link articles to the log — all in one transaction so a
 * crash can't leave articles marked sent without a corresponding log.
 *
 * Note: the SMTP send itself cannot be in the transaction. If the process
 * dies between send-success and this commit, the next tick re-sends that
 * window — we accept rare duplicate emails over silently lost articles.
 */
export async function recordDigestSent(
  userId: string,
  articleIds: string[],
  articleCount: number,
): Promise<string> {
  return db.transaction(async (tx) => {
    if (articleIds.length > 0) {
      await tx
        .insert(emailSentArticles)
        .values(articleIds.map((articleId) => ({ userId, articleId, sentAt: new Date() })))
        .onConflictDoNothing();
    }
    const [log] = await tx
      .insert(emailDigestLogs)
      .values({ userId, articleCount, status: "success", errorMessage: null, sentAt: new Date() })
      .returning({ id: emailDigestLogs.id });
    if (articleIds.length > 0) {
      await tx
        .insert(emailDigestLogArticles)
        .values(articleIds.map((articleId) => ({ logId: log.id, articleId })))
        .onConflictDoNothing();
    }
    return log.id;
  });
}
```

Add `emailSentArticles` to the schema imports of `digest-log.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/email/record-digest-sent.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in `lib/jobs/workers/digest-worker.ts`**

In `sendDigestForDate`, replace the success-path pair:

```typescript
await sendDailyDigestWithRetry({ to: email, subject, html, smtpConfig });
await recordDigestSent(subscription.userId, allArticleIds, articles.length);
```

(remove the `markArticlesAsSent` + `logDigestSendWithArticles(..., "success")` calls; the `"failed"` log in the catch stays as `logDigestSendWithArticles`). Update imports: `recordDigestSent, logDigestSendWithArticles, getLastDigestSentDate` from `@/lib/email/digest-log`; drop the now-unused `markArticlesAsSent` import.

- [ ] **Step 6: Verify and commit**

Run: `pnpm build && pnpm test`
Expected: pass.

```bash
git add -A
git commit -m "fix(digest): record digest send atomically (sent-markers + log in one transaction)"
```

---

### Task 5: Deep tag-batch module (lib/articles/tag-batch.ts)

One interface — "tag this batch of articles for this user, handling rate limits" — used by both the background worker (Task 7) and the digest gate (Task 6). Dependency-injected, so tests need no `vi.mock`.

**Files:**
- Create: `lib/articles/tag-batch.ts`
- Test: `tests/articles/tag-batch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/articles/tag-batch.test.ts
import { describe, it, expect, vi } from "vitest";
import { tagUserArticles, type TaggableArticle } from "@/lib/articles/tag-batch";
import { LlmRateLimitError } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/digest/llm-config";

const llmConfig: LlmConfig = {
  enabled: true,
  baseUrl: "https://llm.test/v1",
  apiKey: "k",
  model: "m",
  format: "openai",
  autoSummarize: false,
  autoTag: true,
};

function art(id: string): TaggableArticle {
  return { id, title: `T-${id}`, summary: null, aiSummary: null, contentText: null, contentHtml: null };
}

function deps(overrides: Partial<Parameters<typeof tagUserArticles>[3]> = {}) {
  return {
    generateTags: vi.fn(async () => [{ name: "ai", existingTagId: null }]),
    addTag: vi.fn(async () => ({ tagId: "t1", name: "ai" })),
    getUserTags: vi.fn(async () => [{ id: "t1", name: "ai" }]),
    ...overrides,
  };
}

describe("tagUserArticles", () => {
  it("tags every article and reports counts", async () => {
    const d = deps();
    const result = await tagUserArticles("u1", [art("a1"), art("a2")], llmConfig, d);
    expect(result).toEqual({ attempted: 2, tagged: 2, failed: 0, rateLimited: false });
    expect(d.addTag).toHaveBeenCalledTimes(2);
  });

  it("an LLM attempt returning no tags still counts as attempted", async () => {
    const d = deps({ generateTags: vi.fn(async () => []) });
    const result = await tagUserArticles("u1", [art("a1")], llmConfig, d);
    expect(result).toEqual({ attempted: 1, tagged: 0, failed: 0, rateLimited: false });
  });

  it("stops the batch on rate limit and reports it", async () => {
    const generateTags = vi
      .fn(async () => [{ name: "ai", existingTagId: null }])
      .mockImplementationOnce(async () => [{ name: "ai", existingTagId: null }])
      .mockImplementationOnce(async () => {
        throw new LlmRateLimitError();
      });
    const d = deps({ generateTags });
    const result = await tagUserArticles("u1", [art("a1"), art("a2"), art("a3")], llmConfig, d);
    expect(result.rateLimited).toBe(true);
    expect(result.attempted).toBe(1);
    expect(generateTags).toHaveBeenCalledTimes(2); // a3 never attempted
  });

  it("counts non-rate-limit LLM failures and continues with next article", async () => {
    const generateTags = vi
      .fn(async () => [{ name: "ai", existingTagId: null }])
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      });
    const d = deps({ generateTags });
    const result = await tagUserArticles("u1", [art("a1"), art("a2")], llmConfig, d);
    expect(result).toEqual({ attempted: 1, tagged: 1, failed: 1, rateLimited: false });
  });

  it("returns zeros for an empty batch without fetching user tags", async () => {
    const d = deps();
    const result = await tagUserArticles("u1", [], llmConfig, d);
    expect(result).toEqual({ attempted: 0, tagged: 0, failed: 0, rateLimited: false });
    expect(d.getUserTags).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/articles/tag-batch.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/articles/tag-batch.ts`**

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { addTagToArticle } from "@/lib/db/queries/articles";
import { generateTagsForArticle } from "@/lib/articles/enrichment";
import { LlmRateLimitError } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/digest/llm-config";

// Cap the user-tag list passed to the model (cost ceiling for users with
// hundreds of tags).
const MAX_USER_TAGS_IN_PROMPT = 100;

export interface TaggableArticle {
  id: string;
  title: string | null;
  summary: string | null;
  aiSummary: string | null;
  contentText: string | null;
  contentHtml: string | null;
}

export interface TagBatchResult {
  /** Articles whose LLM call completed — including ones that got no tags. */
  attempted: number;
  /** Tag links actually written. */
  tagged: number;
  /** Articles whose LLM call threw a non-rate-limit error. */
  failed: number;
  /** True if the batch stopped early on a 429. */
  rateLimited: boolean;
}

export interface TagBatchDeps {
  generateTags: typeof generateTagsForArticle;
  addTag: typeof addTagToArticle;
  getUserTags: (userId: string) => Promise<Array<{ id: string; name: string }>>;
}

async function defaultGetUserTags(userId: string): Promise<Array<{ id: string; name: string }>> {
  return db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId));
}

const defaultDeps: TagBatchDeps = {
  generateTags: generateTagsForArticle,
  addTag: addTagToArticle,
  getUserTags: defaultGetUserTags,
};

/**
 * Tag a batch of articles for one user. Rate limits stop the batch (resume
 * on a later call); other LLM errors skip the article and continue.
 */
export async function tagUserArticles(
  userId: string,
  articles: TaggableArticle[],
  llmConfig: LlmConfig,
  deps: TagBatchDeps = defaultDeps,
): Promise<TagBatchResult> {
  const result: TagBatchResult = { attempted: 0, tagged: 0, failed: 0, rateLimited: false };
  if (articles.length === 0) return result;

  const userTags = (await deps.getUserTags(userId)).slice(0, MAX_USER_TAGS_IN_PROMPT);

  for (const article of articles) {
    try {
      const suggestions = await deps.generateTags(article, userTags, llmConfig);
      result.attempted++;
      for (const s of suggestions) {
        try {
          await deps.addTag(userId, article.id, s.name);
          result.tagged++;
        } catch (err) {
          console.error(
            `[tag-batch] addTag failed (user=${userId}, article=${article.id}, tag=${s.name}):`,
            err,
          );
        }
      }
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        result.rateLimited = true;
        console.warn(`[tag-batch] Rate-limited for user ${userId}, stopping batch`);
        break;
      }
      result.failed++;
      console.error(
        `[tag-batch] LLM failed (user=${userId}, article=${article.id}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/articles/tag-batch.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify build, commit**

Run: `pnpm build && pnpm test`

```bash
git add -A
git commit -m "feat(articles): add tagUserArticles deep module for batch tagging"
```

---

### Task 6: Digest tag-gate — no digest until all articles are tagged

HARD REQUIREMENT from the user: when auto-tag is enabled, a digest may only go out once every candidate article has been THROUGH tagging. "Through tagging" = an LLM tagging attempt completed (an article the LLM returns zero tags for is processed — it lands in Uncategorized). If attempts fail (rate limit / LLM error), the digest is POSTPONED — the digest worker runs every minute, so it retries until tagging succeeds. If the user has no working LLM config (`getUserLlmConfig` returns null — including decrypt failure), the gate does not apply (LLM features are opt-in and must not block the core product).

**Files:**
- Create: `lib/digest/tag-gate.ts`
- Modify: `lib/db/queries/articles.ts` (add `getEnrichableArticlesByIds`)
- Modify: `lib/jobs/workers/digest-worker.ts` (wire gate into `sendDigestForDate` + postpone semantics in `processDailyDigests`)
- Test: `tests/digest/tag-gate.test.ts`, `tests/jobs/digest-orchestration.test.ts`

- [ ] **Step 1: Add `getEnrichableArticlesByIds` to `lib/db/queries/articles.ts`**

The gate needs full article content for good tag prompts (EmailArticle only carries summaries). Add `inArray` to the existing drizzle-orm import of that file.

```typescript
/** Fetch the content fields the LLM tagging prompt needs, by article id. */
export async function getEnrichableArticlesByIds(articleIds: string[]): Promise<
  Array<{
    id: string;
    title: string | null;
    summary: string | null;
    aiSummary: string | null;
    contentText: string | null;
    contentHtml: string | null;
  }>
> {
  if (articleIds.length === 0) return [];
  return db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      aiSummary: articles.aiSummary,
      contentText: articles.contentText,
      contentHtml: articles.contentHtml,
    })
    .from(articles)
    .where(inArray(articles.id, articleIds));
}
```

- [ ] **Step 2: Write the failing tag-gate test**

```typescript
// tests/digest/tag-gate.test.ts
import { describe, it, expect, vi } from "vitest";
import { ensureArticlesTagged } from "@/lib/digest/tag-gate";
import type { DigestArticle } from "@/lib/digest/types";
import type { LlmConfig } from "@/lib/digest/llm-config";

const llm: LlmConfig = {
  enabled: true,
  baseUrl: "https://llm.test/v1",
  apiKey: "k",
  model: "m",
  format: "openai",
  autoSummarize: false,
  autoTag: true,
};

function art(id: string, tagged: boolean): DigestArticle {
  return {
    id,
    title: `T-${id}`,
    url: `https://e.com/${id}`,
    summary: null,
    aiSummary: null,
    importance: null,
    feedTitle: "f",
    feedId: "feed-1",
    publishedAt: new Date(),
    tags: tagged ? [{ id: "t1", name: "ai" }] : [],
  };
}

function deps(overrides: Partial<Parameters<typeof ensureArticlesTagged>[2]> = {}) {
  return {
    getLlmConfig: vi.fn(async () => llm),
    getEnrichable: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, title: `T-${id}`, summary: null, aiSummary: null, contentText: "body", contentHtml: null })),
    ),
    tagBatch: vi.fn(async () => ({ attempted: 1, tagged: 1, failed: 0, rateLimited: false })),
    ...overrides,
  };
}

describe("ensureArticlesTagged", () => {
  it("passes when auto-tag is disabled (no config)", async () => {
    const d = deps({ getLlmConfig: vi.fn(async () => null) });
    const out = await ensureArticlesTagged("u1", [art("a1", false)], d);
    expect(out).toEqual({ status: "ready", retagged: false });
    expect(d.tagBatch).not.toHaveBeenCalled();
  });

  it("passes when auto-tag is on but every article already has tags", async () => {
    const d = deps();
    const out = await ensureArticlesTagged("u1", [art("a1", true), art("a2", true)], d);
    expect(out).toEqual({ status: "ready", retagged: false });
    expect(d.tagBatch).not.toHaveBeenCalled();
  });

  it("tags untagged articles inline, then reports retagged so caller can re-fetch", async () => {
    const d = deps();
    const out = await ensureArticlesTagged("u1", [art("a1", true), art("a2", false)], d);
    expect(out).toEqual({ status: "ready", retagged: true });
    expect(d.getEnrichable).toHaveBeenCalledWith(["a2"]);
    expect(d.tagBatch).toHaveBeenCalledTimes(1);
  });

  it("POSTPONES when tagging is rate-limited", async () => {
    const d = deps({
      tagBatch: vi.fn(async () => ({ attempted: 0, tagged: 0, failed: 0, rateLimited: true })),
    });
    const out = await ensureArticlesTagged("u1", [art("a1", false)], d);
    expect(out.status).toBe("postponed");
  });

  it("POSTPONES when any tagging attempt failed", async () => {
    const d = deps({
      tagBatch: vi.fn(async () => ({ attempted: 1, tagged: 1, failed: 1, rateLimited: false })),
    });
    const out = await ensureArticlesTagged("u1", [art("a1", false), art("a2", false)], d);
    expect(out.status).toBe("postponed");
  });

  it("is ready for an empty article list", async () => {
    const d = deps();
    const out = await ensureArticlesTagged("u1", [], d);
    expect(out).toEqual({ status: "ready", retagged: false });
    expect(d.getLlmConfig).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test tests/digest/tag-gate.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement `lib/digest/tag-gate.ts`**

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test tests/digest/tag-gate.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the gate into `lib/jobs/workers/digest-worker.ts`**

Change `sendDigestForDate` to return `"sent" | "postponed"` and export it (for orchestration tests). At the top of the function after fetching articles:

```typescript
export async function sendDigestForDate(
  subscription: Awaited<ReturnType<typeof getAllActiveSubscriptions>>[0],
  triggerDate: Date,
  fromDate: Date | null,
): Promise<"sent" | "postponed"> {
  const email = await getUserEmail(subscription.userId);
  if (!email) {
    console.log(`[digest] No email for user ${subscription.userId}`);
    return "sent"; // nothing to send for this user; don't block the loop
  }

  let articles = await getArticlesForEmail(subscription.userId, fromDate ?? undefined, triggerDate);

  const gate = await ensureArticlesTagged(subscription.userId, articles);
  if (gate.status === "postponed") {
    console.log(`[digest] Postponed for user ${subscription.userId}: ${gate.reason}`);
    return "postponed";
  }
  if (gate.retagged) {
    // Tags were written after the first fetch — re-read so grouping sees them.
    articles = await getArticlesForEmail(subscription.userId, fromDate ?? undefined, triggerDate);
  }
  // ... rest of the function unchanged, but `return "sent";` after the
  // success console.log at the end of the try block.
```

Add the import: `import { ensureArticlesTagged } from "@/lib/digest/tag-gate";`

In `processDailyDigests`, stop processing further missed dates for a user once one is postponed (preserves chronological windows; next tick retries):

```typescript
for (let i = 0; i < missedDates.length; i++) {
  const triggerDate = missedDates[i];
  const fromDate = i === 0 ? lastSent : missedDates[i - 1];
  const outcome = await sendDigestForDate(sub, triggerDate, fromDate);
  if (outcome === "postponed") break;
}
```

- [ ] **Step 7: Write the orchestration test**

```typescript
// tests/jobs/digest-orchestration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/email/subscription-settings", () => ({
  getAllActiveSubscriptions: vi.fn(),
  getUserEmail: vi.fn(),
  updateNextScheduledAt: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email/digest-articles", () => ({
  getArticlesForEmail: vi.fn(),
}));
vi.mock("@/lib/email/digest-log", () => ({
  getLastDigestSentDate: vi.fn(),
  recordDigestSent: vi.fn(async () => "log-1"),
  logDigestSendWithArticles: vi.fn(async () => "log-1"),
}));
vi.mock("@/lib/email/sender", () => ({
  sendDailyDigest: vi.fn(async () => undefined),
}));
vi.mock("@/lib/digest/tag-gate", () => ({
  ensureArticlesTagged: vi.fn(async () => ({ status: "ready", retagged: false })),
}));

import { getAllActiveSubscriptions, getUserEmail } from "@/lib/email/subscription-settings";
import { getArticlesForEmail } from "@/lib/email/digest-articles";
import { getLastDigestSentDate, recordDigestSent, logDigestSendWithArticles } from "@/lib/email/digest-log";
import { sendDailyDigest } from "@/lib/email/sender";
import { ensureArticlesTagged } from "@/lib/digest/tag-gate";
import { processDailyDigests } from "@/lib/jobs/workers/digest-worker";

const SUB = {
  id: "sub-1",
  userId: "user-1",
  sendTime: "08:00",
  frequency: "daily" as const,
  cronExpression: "0 * * * *", // hourly, keeps trigger math timezone-proof
  nextScheduledAt: null,
  lastSentAt: null,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpPass: null,
  smtpFrom: null,
  autoSaveOnClick: false,
  markReadOnClick: true,
};

function digestArticle(id: string) {
  return {
    id,
    title: `T-${id}`,
    url: `https://e.com/${id}`,
    summary: null,
    aiSummary: null,
    importance: null,
    feedTitle: "f",
    feedId: "feed-1",
    publishedAt: new Date(),
    tags: [{ id: "t1", name: "ai" }],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // 12:30 local: exactly one hourly trigger (12:00) since lastSent 11:29.
  vi.setSystemTime(new Date(2026, 5, 10, 12, 30, 0));
  vi.mocked(getAllActiveSubscriptions).mockResolvedValue([SUB]);
  vi.mocked(getUserEmail).mockResolvedValue("u@example.com");
  vi.mocked(getLastDigestSentDate).mockResolvedValue(new Date(2026, 5, 10, 11, 29, 0));
  vi.mocked(getArticlesForEmail).mockResolvedValue([digestArticle("a1")]);
  vi.mocked(ensureArticlesTagged).mockResolvedValue({ status: "ready", retagged: false });
  vi.mocked(sendDailyDigest).mockClear().mockResolvedValue(undefined);
  vi.mocked(recordDigestSent).mockClear().mockResolvedValue("log-1");
  vi.mocked(logDigestSendWithArticles).mockClear().mockResolvedValue("log-1");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("processDailyDigests orchestration", () => {
  it("sends one digest for one missed trigger and records it atomically", async () => {
    await processDailyDigests();
    expect(sendDailyDigest).toHaveBeenCalledTimes(1);
    expect(recordDigestSent).toHaveBeenCalledWith("user-1", ["a1"], 1);
    expect(logDigestSendWithArticles).not.toHaveBeenCalled(); // no failure log
  });

  it("logs a failed send and does NOT record articles as sent", async () => {
    vi.mocked(sendDailyDigest).mockRejectedValue(new Error("smtp down"));
    const run = processDailyDigests();
    await vi.advanceTimersByTimeAsync(60_000); // burn through retry backoff
    await run;
    expect(recordDigestSent).not.toHaveBeenCalled();
    expect(logDigestSendWithArticles).toHaveBeenCalledWith(
      "user-1",
      ["a1"],
      1,
      "failed",
      "smtp down",
    );
  });

  it("postponed gate: no send, no logs, later windows not attempted", async () => {
    // Two missed triggers: 11:00 and 12:00.
    vi.mocked(getLastDigestSentDate).mockResolvedValue(new Date(2026, 5, 10, 10, 29, 0));
    vi.mocked(ensureArticlesTagged).mockResolvedValue({
      status: "postponed",
      reason: "tagging incomplete: rate-limited",
    });
    await processDailyDigests();
    expect(sendDailyDigest).not.toHaveBeenCalled();
    expect(recordDigestSent).not.toHaveBeenCalled();
    expect(logDigestSendWithArticles).not.toHaveBeenCalled();
    expect(getArticlesForEmail).toHaveBeenCalledTimes(1); // only first window tried
  });

  it("re-fetches articles when the gate tagged inline", async () => {
    vi.mocked(ensureArticlesTagged).mockResolvedValue({ status: "ready", retagged: true });
    await processDailyDigests();
    expect(getArticlesForEmail).toHaveBeenCalledTimes(2);
    expect(sendDailyDigest).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Run all tests**

Run: `pnpm test`
Expected: PASS (including the existing `tests/jobs/digest-worker.test.ts` and the resend/preview API tests — if those mock `sendDigestForDate`-adjacent modules, update their mock paths per Task 3 changes).

- [ ] **Step 9: Build and commit**

Run: `pnpm build`

```bash
git add -A
git commit -m "feat(digest): gate digest sends on auto-tag completion, postpone until tagged"
```

---

### Task 7: Deduplicate enrichment-worker and reuse tag-batch

`runAutoTagging` and `runAutoSummarizing` carry identical config-fetch + rate-limit boilerplate. Extract the per-user wrapper, make `runAutoTagging` delegate to `tagUserArticles`, and add worker tests.

**Files:**
- Modify: `lib/jobs/workers/enrichment-worker.ts` (full rewrite below)
- Test: `tests/jobs/enrichment-worker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/jobs/enrichment-worker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/digest/llm-config", () => ({
  getUsersWithAutoTagEnabled: vi.fn(),
  getUsersWithAutoSummarizeEnabled: vi.fn(),
  getUserLlmConfig: vi.fn(),
}));
vi.mock("@/lib/db/queries/articles", () => ({
  getUntaggedArticlesForUser: vi.fn(),
  getUnsummarizedArticlesForUser: vi.fn(),
  setArticleAiSummary: vi.fn(async () => undefined),
  setArticleImportance: vi.fn(async () => undefined),
  addTagToArticle: vi.fn(async () => ({ tagId: "t1", name: "ai" })),
}));
vi.mock("@/lib/articles/tag-batch", () => ({
  tagUserArticles: vi.fn(),
}));
vi.mock("@/lib/articles/enrichment", () => ({
  generateArticleSummary: vi.fn(),
  generateTagsForArticle: vi.fn(),
}));

import {
  getUsersWithAutoTagEnabled,
  getUsersWithAutoSummarizeEnabled,
  getUserLlmConfig,
} from "@/lib/digest/llm-config";
import {
  getUntaggedArticlesForUser,
  getUnsummarizedArticlesForUser,
  setArticleAiSummary,
  setArticleImportance,
} from "@/lib/db/queries/articles";
import { tagUserArticles } from "@/lib/articles/tag-batch";
import { generateArticleSummary } from "@/lib/articles/enrichment";
import { LlmRateLimitError } from "@/lib/digest/llm-client";
import { runAutoTagging, runAutoSummarizing } from "@/lib/jobs/workers/enrichment-worker";

const llm = {
  enabled: true,
  baseUrl: "https://llm.test/v1",
  apiKey: "k",
  model: "m",
  format: "openai" as const,
  autoSummarize: true,
  autoTag: true,
};

function enrichable(id: string) {
  return { id, title: `T-${id}`, summary: null, aiSummary: null, contentText: "x".repeat(900), contentHtml: null };
}

beforeEach(() => {
  vi.mocked(getUsersWithAutoTagEnabled).mockReset();
  vi.mocked(getUsersWithAutoSummarizeEnabled).mockReset();
  vi.mocked(getUserLlmConfig).mockReset().mockResolvedValue(llm);
  vi.mocked(getUntaggedArticlesForUser).mockReset();
  vi.mocked(getUnsummarizedArticlesForUser).mockReset();
  vi.mocked(tagUserArticles).mockReset();
  vi.mocked(generateArticleSummary).mockReset();
  vi.mocked(setArticleAiSummary).mockClear();
  vi.mocked(setArticleImportance).mockClear();
});

describe("runAutoTagging", () => {
  it("returns zeros when no user has auto-tag on", async () => {
    vi.mocked(getUsersWithAutoTagEnabled).mockResolvedValue([]);
    expect(await runAutoTagging()).toEqual({ users: 0, tagged: 0 });
  });

  it("skips users without a working LLM config", async () => {
    vi.mocked(getUsersWithAutoTagEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUserLlmConfig).mockResolvedValue(null);
    expect(await runAutoTagging()).toEqual({ users: 1, tagged: 0 });
    expect(getUntaggedArticlesForUser).not.toHaveBeenCalled();
  });

  it("delegates each user's untagged batch to tagUserArticles and sums counts", async () => {
    vi.mocked(getUsersWithAutoTagEnabled).mockResolvedValue(["u1", "u2"]);
    vi.mocked(getUntaggedArticlesForUser).mockResolvedValue([enrichable("a1")]);
    vi.mocked(tagUserArticles).mockResolvedValue({ attempted: 1, tagged: 2, failed: 0, rateLimited: false });
    expect(await runAutoTagging()).toEqual({ users: 2, tagged: 4 });
    expect(tagUserArticles).toHaveBeenCalledTimes(2);
  });
});

describe("runAutoSummarizing", () => {
  it("persists summary and importance on success", async () => {
    vi.mocked(getUsersWithAutoSummarizeEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUnsummarizedArticlesForUser).mockResolvedValue([enrichable("a1")]);
    vi.mocked(generateArticleSummary).mockResolvedValue({
      kind: "ok",
      result: { summary: "s", importance: "high" },
    });
    expect(await runAutoSummarizing()).toEqual({ users: 1, summarized: 1 });
    expect(setArticleAiSummary).toHaveBeenCalledWith("a1", "s");
    expect(setArticleImportance).toHaveBeenCalledWith("a1", "high");
  });

  it("stops the user's batch on rate limit but does not throw", async () => {
    vi.mocked(getUsersWithAutoSummarizeEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUnsummarizedArticlesForUser).mockResolvedValue([enrichable("a1"), enrichable("a2")]);
    vi.mocked(generateArticleSummary).mockRejectedValueOnce(new LlmRateLimitError());
    expect(await runAutoSummarizing()).toEqual({ users: 1, summarized: 0 });
    expect(generateArticleSummary).toHaveBeenCalledTimes(1);
  });

  it("continues to the next article on a non-rate-limit error", async () => {
    vi.mocked(getUsersWithAutoSummarizeEnabled).mockResolvedValue(["u1"]);
    vi.mocked(getUnsummarizedArticlesForUser).mockResolvedValue([enrichable("a1"), enrichable("a2")]);
    vi.mocked(generateArticleSummary)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ kind: "ok", result: { summary: "s2", importance: null } });
    expect(await runAutoSummarizing()).toEqual({ users: 1, summarized: 1 });
    expect(setArticleAiSummary).toHaveBeenCalledWith("a2", "s2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/jobs/enrichment-worker.test.ts`
Expected: FAIL (current implementation doesn't delegate to tagUserArticles; counts differ).

- [ ] **Step 3: Rewrite `lib/jobs/workers/enrichment-worker.ts`**

```typescript
import {
  getUnsummarizedArticlesForUser,
  getUntaggedArticlesForUser,
  setArticleAiSummary,
  setArticleImportance,
} from "@/lib/db/queries/articles";
import {
  getUsersWithAutoTagEnabled,
  getUsersWithAutoSummarizeEnabled,
  getUserLlmConfig,
  type LlmConfig,
} from "@/lib/digest/llm-config";
import { generateArticleSummary } from "@/lib/articles/enrichment";
import { tagUserArticles } from "@/lib/articles/tag-batch";
import { LlmRateLimitError } from "@/lib/digest/llm-client";

const ARTICLES_PER_RUN_PER_USER = 20;
const LOOKBACK_DAYS = 14;

/**
 * Run `fn` for every listed user that has a working LLM config. Config
 * lookup failures are logged and skip the user; per-user failures must be
 * handled inside `fn`.
 */
async function forEachUserWithLlm(
  label: string,
  userIds: string[],
  fn: (userId: string, llmConfig: LlmConfig) => Promise<void>,
): Promise<void> {
  await Promise.all(
    userIds.map(async (userId) => {
      let llmConfig: LlmConfig | null;
      try {
        llmConfig = await getUserLlmConfig(userId);
      } catch (err) {
        console.error(`[${label}] LLM config lookup failed for ${userId}:`, err);
        return;
      }
      if (!llmConfig) return;
      await fn(userId, llmConfig);
    }),
  );
}

/**
 * Periodic background job: for every user with Auto-tag enabled, tag their
 * most recent untagged articles (at most ARTICLES_PER_RUN_PER_USER per tick;
 * backlogs catch up over multiple ticks rather than spiking token usage).
 */
export async function runAutoTagging(): Promise<{ users: number; tagged: number }> {
  const userIds = await getUsersWithAutoTagEnabled();
  if (userIds.length === 0) return { users: 0, tagged: 0 };

  let totalTagged = 0;
  await forEachUserWithLlm("auto-tag", userIds, async (userId, llmConfig) => {
    const untagged = await getUntaggedArticlesForUser(
      userId,
      LOOKBACK_DAYS,
      ARTICLES_PER_RUN_PER_USER,
    );
    if (untagged.length === 0) return;
    const result = await tagUserArticles(userId, untagged, llmConfig);
    totalTagged += result.tagged;
  });

  return { users: userIds.length, tagged: totalTagged };
}

/**
 * Companion job: fills in ai_summary + importance for recent articles when
 * the user has Auto-summarise on. Articles below the min-chars threshold are
 * skipped (`too-short`) — same articles will keep returning too-short; we
 * accept that cost vs. tracking a "tried-and-skipped" flag.
 */
export async function runAutoSummarizing(): Promise<{ users: number; summarized: number }> {
  const userIds = await getUsersWithAutoSummarizeEnabled();
  if (userIds.length === 0) return { users: 0, summarized: 0 };

  let totalSummarized = 0;
  await forEachUserWithLlm("auto-summary", userIds, async (userId, llmConfig) => {
    const targets = await getUnsummarizedArticlesForUser(
      userId,
      LOOKBACK_DAYS,
      ARTICLES_PER_RUN_PER_USER,
    );
    for (const article of targets) {
      try {
        const outcome = await generateArticleSummary(article, llmConfig);
        if (outcome.kind === "ok") {
          await setArticleAiSummary(article.id, outcome.result.summary);
          if (outcome.result.importance) {
            await setArticleImportance(article.id, outcome.result.importance);
          }
          totalSummarized++;
        }
      } catch (err) {
        if (err instanceof LlmRateLimitError) {
          console.warn(`[auto-summary] Rate-limited for user ${userId}, stopping this tick`);
          break;
        }
        console.error(
          `[auto-summary] LLM failed (user=${userId}, article=${article.id}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  });

  return { users: userIds.length, summarized: totalSummarized };
}
```

(Note: the old direct `db`/`tags` imports and the user-tag prompt cap move into `tag-batch.ts`; remove them here.)

- [ ] **Step 4: Run tests, build, commit**

Run: `pnpm test && pnpm build`
Expected: PASS.

```bash
git add -A
git commit -m "refactor(jobs): dedupe enrichment worker via forEachUserWithLlm + tagUserArticles"
```

---

### Task 8: Extract feed ingestion into lib/feeds/ingest.ts with a transaction

Feed metadata update + article upsert become one transaction; events publish after commit. The BullMQ worker becomes a thin shell. The "fetch a feed and store articles" concept gets one home.

**Files:**
- Create: `lib/feeds/ingest.ts`
- Modify: `lib/jobs/workers/feed-worker.ts`
- Test: `tests/feeds/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/feeds/ingest.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedError } from "@/lib/feeds/feed-error";

const h = vi.hoisted(() => {
  const updateCalls: Array<{ set: unknown }> = [];
  const insertedIds = [{ id: "a-1" }, { id: "a-2" }];
  const tx = {
    update: () => ({
      set: (set: unknown) => {
        updateCalls.push({ set });
        return { where: async () => undefined };
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => insertedIds,
        }),
      }),
    }),
  };
  const db = {
    transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    update: tx.update,
  };
  return { db, updateCalls, insertedIds };
});

vi.mock("@/lib/db", () => ({ db: h.db }));

import { ingestFeed } from "@/lib/feeds/ingest";

function deps(overrides: Partial<Parameters<typeof ingestFeed>[2]> = {}) {
  return {
    parse: vi.fn(async () => ({
      title: "Feed",
      description: null,
      siteUrl: null,
      iconUrl: null,
      articles: [
        { guid: "g1", url: "https://e.com/1", title: "A1", author: null, contentHtml: null, contentText: null, summary: null, imageUrl: null, publishedAt: null },
      ],
    })),
    publish: vi.fn(async () => undefined),
    getSubscribers: vi.fn(async () => ["u1", "u2"]),
    ...overrides,
  };
}

beforeEach(() => {
  h.updateCalls.length = 0;
  h.db.transaction.mockClear();
});

describe("ingestFeed", () => {
  it("updates feed metadata and inserts articles in one transaction, then publishes per subscriber", async () => {
    const d = deps();
    const out = await ingestFeed("feed-1", "https://e.com/rss", d);
    expect(h.db.transaction).toHaveBeenCalledTimes(1);
    expect(out.articleCount).toBe(2); // returning() rows
    expect(d.publish).toHaveBeenCalledTimes(2);
    expect(d.publish).toHaveBeenCalledWith("u1", { type: "articles.new", feedId: "feed-1", count: 2 });
  });

  it("publishes feed.fetched (no articles.new) when the feed has no entries", async () => {
    const d = deps({
      parse: vi.fn(async () => ({ title: "Feed", description: null, siteUrl: null, iconUrl: null, articles: [] })),
    });
    const out = await ingestFeed("feed-1", "https://e.com/rss", d);
    expect(out.articleCount).toBe(0);
    expect(d.publish).toHaveBeenCalledWith("u1", { type: "feed.fetched", feedId: "feed-1" });
  });

  it("on parse failure: records the error on the feed, notifies subscribers, rethrows a FeedError", async () => {
    const d = deps({ parse: vi.fn(async () => { throw new Error("not a feed"); }) });
    await expect(ingestFeed("feed-1", "https://e.com/rss", d)).rejects.toBeInstanceOf(FeedError);
    // failure path writes via db.update (outside transaction)
    expect(h.updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(d.publish).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ type: "feed.error", feedId: "feed-1" }),
    );
  });
});
```

NOTE: check how `FeedError` is exported from `lib/feeds/feed-error.ts` (the class is referenced in `app/api/feeds/route.ts` as `err instanceof FeedError`). If `classifyError` returns a `FeedError` instance, `rejects.toBeInstanceOf(FeedError)` holds.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/feeds/ingest.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `lib/feeds/ingest.ts`**

Move the body of the current worker callback (lib/jobs/workers/feed-worker.ts lines 20–114) into this module, with the success-path DB writes wrapped in `db.transaction`:

```typescript
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds, articles } from "@/lib/db/schema";
import { parseFeed } from "@/lib/feeds/parser";
import { classifyError, humanMessage } from "@/lib/feeds/feed-error";
import { publishEvent } from "@/lib/events/publisher";
import { getSubscriberUserIds } from "@/lib/db/queries/feeds";

export interface IngestDeps {
  parse: typeof parseFeed;
  publish: typeof publishEvent;
  getSubscribers: typeof getSubscriberUserIds;
}

const defaultDeps: IngestDeps = {
  parse: parseFeed,
  publish: publishEvent,
  getSubscribers: getSubscriberUserIds,
};

function extractFirstImageUrl(html: string | null | undefined): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]+src=["'](https?:\/\/[^"'\s>]+)["']/i);
  return match?.[1];
}

/**
 * Fetch + parse a feed and store its articles. Feed metadata update and
 * article upsert happen in ONE transaction; subscriber events are published
 * after commit (best-effort — publishEvent swallows Redis errors).
 *
 * On failure: records the classified error on the feed row, notifies
 * subscribers, and rethrows the FeedError so BullMQ can retry per job options.
 */
export async function ingestFeed(
  feedId: string,
  url: string,
  deps: IngestDeps = defaultDeps,
): Promise<{ articleCount: number }> {
  try {
    const parsed = await deps.parse(url);

    const inserted = await db.transaction(async (tx) => {
      await tx
        .update(feeds)
        .set({
          title: parsed.title ?? undefined,
          description: parsed.description ?? undefined,
          siteUrl: parsed.siteUrl ?? undefined,
          iconUrl: parsed.iconUrl ?? undefined,
          lastFetchedAt: new Date(),
          lastFetchError: null,
          errorCode: null,
          consecutiveFailures: 0,
        })
        .where(eq(feeds.id, feedId));

      if (parsed.articles.length === 0) return [];

      return tx
        .insert(articles)
        .values(
          parsed.articles.map((a) => ({
            feedId,
            guid: a.guid,
            url: a.url ?? undefined,
            title: a.title ?? undefined,
            author: a.author ?? undefined,
            contentHtml: a.contentHtml ?? undefined,
            contentText: a.contentText ?? undefined,
            summary: a.summary ?? undefined,
            imageUrl: a.imageUrl ?? extractFirstImageUrl(a.contentHtml) ?? undefined,
            publishedAt: a.publishedAt ?? undefined,
          })),
        )
        .onConflictDoUpdate({
          target: [articles.feedId, articles.guid],
          set: {
            url: sql`excluded.url`,
            title: sql`excluded.title`,
            author: sql`excluded.author`,
            contentHtml: sql`excluded.content_html`,
            contentText: sql`excluded.content_text`,
            summary: sql`excluded.summary`,
            imageUrl: sql`excluded.image_url`,
            publishedAt: sql`excluded.published_at`,
          },
        })
        .returning({ id: articles.id });
    });

    const subscriberIds = await deps.getSubscribers(feedId).catch(() => []);
    if (inserted.length === 0) {
      await Promise.all(
        subscriberIds.map((uid) => deps.publish(uid, { type: "feed.fetched", feedId })),
      );
      return { articleCount: 0 };
    }

    await Promise.all(
      subscriberIds.map((uid) =>
        deps.publish(uid, { type: "articles.new", feedId, count: inserted.length }),
      ),
    );
    return { articleCount: inserted.length };
  } catch (rawError) {
    const feedError = classifyError(rawError);
    const message = humanMessage(feedError.code, feedError.httpStatus);

    await db
      .update(feeds)
      .set({
        lastFetchError: message,
        errorCode: feedError.code,
        lastFetchedAt: new Date(),
        consecutiveFailures: sql`${feeds.consecutiveFailures} + 1`,
      })
      .where(eq(feeds.id, feedId));

    const subscriberIds = await deps.getSubscribers(feedId).catch(() => []);
    await Promise.all(
      subscriberIds.map((uid) =>
        deps.publish(uid, { type: "feed.error", feedId, errorCode: feedError.code, message }),
      ),
    );

    throw feedError;
  }
}
```

CAUTION: the original worker published `feed.fetched` when `parsed.articles.length === 0` BEFORE inserting; this version publishes after the transaction — semantics preserved. Check `FeedwiseEvent` type in `lib/events/types.ts` for exact event shapes and match them.

- [ ] **Step 4: Slim down `lib/jobs/workers/feed-worker.ts`**

```typescript
import { Worker } from "bullmq";
import { getConnection } from "@/lib/jobs/queue";
import { ingestFeed } from "@/lib/feeds/ingest";

export function startFeedWorker() {
  const worker = new Worker(
    "feed.fetch",
    async (job) => {
      const { feedId, url } = job.data as { feedId: string; url: string };
      await ingestFeed(feedId, url);
    },
    { connection: getConnection(), concurrency: 5 },
  );

  worker.on("completed", (job) => {
    console.log(`[feed-worker] ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[feed-worker] ${job?.id} failed:`, err.message);
  });

  return worker;
}
```

- [ ] **Step 5: Run tests, build, commit**

Run: `pnpm test && pnpm build`
Expected: PASS.

```bash
git add -A
git commit -m "refactor(feeds): extract transactional ingestFeed module, slim worker shell"
```

---

### Task 9: withAuth route wrapper

Kill the 80+ repeated auth/error blocks. The wrapper handles: 401 on missing session, 400 on ZodError, 500 (generic message, detail logged server-side) on anything uncaught. Routes keep domain-specific catches inside their handler.

**Files:**
- Create: `lib/api/with-auth.ts`
- Test: `tests/api/with-auth.test.ts`
- Modify: route files (Step 5 checklist)

- [ ] **Step 1: Check Next.js 16 route handler signature**

Read `node_modules/next/dist/docs/` route-handler docs. In Next.js 15+/16, the second route-handler argument has `params` as a **Promise**: `{ params: Promise<Record<string, string>> }`. Confirm against an existing dynamic route, e.g. `app/api/articles/[id]/route.ts`, and match whatever the codebase actually does.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/api/with-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { withAuth } from "@/lib/api/with-auth";

const mockSession = { user: { id: "user-1" } };

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
});

describe("withAuth", () => {
  it("returns 401 when requireSession rejects", async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Error("nope"));
    const handler = withAuth(async () => Response.json({ success: true }));
    const res = await handler(new Request("https://t.local/api/x"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
  });

  it("passes session and ctx through to the handler", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const seen: unknown[] = [];
    const handler = withAuth(async (_req, session, ctx) => {
      seen.push(session, await ctx.params);
      return Response.json({ success: true });
    });
    const res = await handler(new Request("https://t.local/api/x"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([mockSession, { id: "42" }]);
  });

  it("maps ZodError to 400", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const handler = withAuth(async () => {
      z.object({ q: z.string() }).parse({});
      return Response.json({ success: true });
    });
    const res = await handler(new Request("https://t.local/api/x"), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it("maps unexpected errors to 500 with a generic message", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const handler = withAuth(async () => {
      throw new Error("secret detail");
    });
    const res = await handler(new Request("https://t.local/api/x"), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal error"); // detail must not leak
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then implement `lib/api/with-auth.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";

type Session = Awaited<ReturnType<typeof requireSession>>;

export interface RouteContext {
  params: Promise<Record<string, string>>;
}

type AuthedHandler = (req: Request, session: Session, ctx: RouteContext) => Promise<Response>;

/**
 * Wrap an App Router route handler with the standard auth + error envelope:
 * 401 when unauthenticated, 400 on ZodError, 500 (generic message, detail
 * logged) on anything uncaught. Domain-specific error mapping stays inside
 * the handler.
 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, ctx: RouteContext): Promise<Response> => {
    let session: Session;
    try {
      session = await requireSession();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
      return await handler(req, session, ctx);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, error);
      return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
    }
  };
}
```

Run: `pnpm test tests/api/with-auth.test.ts`
Expected: PASS.

- [ ] **Step 4: Convert `app/api/feeds/route.ts` as the reference example**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { findFeedByUrl, getSubscriptions, subscribeFeed } from "@/lib/db/queries/feeds";
import { getFeedFetchQueue } from "@/lib/jobs/queue";
import { preflightFeed } from "@/lib/feeds/parser";
import { FeedError, classifyError, humanMessage } from "@/lib/feeds/feed-error";

const SUBSCRIBE_PREFLIGHT_TIMEOUT_MS = 5_000;

const SubscribeSchema = z
  .object({
    url: z.string().url().optional(),
    urls: z.array(z.string().url()).optional(),
    folderId: z.string().uuid().optional(),
  })
  .refine((d) => d.url || (d.urls && d.urls.length > 0), {
    message: "Provide url or urls",
  });

interface SubscribeResult {
  url: string;
  feedId?: string;
  error?: string;
  errorCode?: string;
}

export const GET = withAuth(async (_req, session) => {
  const subs = await getSubscriptions(session.user.id);
  return NextResponse.json({ success: true, data: subs });
});

export const POST = withAuth(async (req, session) => {
  const body = await req.json();
  const { url, urls, folderId } = SubscribeSchema.parse(body);

  const feedUrls = urls ?? (url ? [url] : []);
  const results: SubscribeResult[] = [];

  for (const feedUrl of feedUrls) {
    try {
      const existing = await findFeedByUrl(feedUrl);
      const alreadyHealthy = existing && existing.lastFetchedAt;

      if (!alreadyHealthy) {
        await preflightFeed(feedUrl, SUBSCRIBE_PREFLIGHT_TIMEOUT_MS);
      }

      const { feedId } = await subscribeFeed(session.user.id, feedUrl, folderId);
      try {
        await getFeedFetchQueue().add(
          "fetch",
          { feedId, url: feedUrl },
          { jobId: `feed-${feedId}-init`, attempts: 3 },
        );
      } catch {
        // Non-fatal: subscription saved, fetch will retry on next scheduler run
      }
      results.push({ url: feedUrl, feedId });
    } catch (err) {
      const fe = err instanceof FeedError ? err : classifyError(err);
      results.push({
        url: feedUrl,
        error: humanMessage(fe.code, fe.httpStatus),
        errorCode: fe.code,
      });
    }
  }

  const succeeded = results.filter((r) => r.feedId);
  const failed = results.filter((r) => r.error);

  if (feedUrls.length === 1 && failed.length === 1) {
    return NextResponse.json(
      { success: false, error: failed[0].error, errorCode: failed[0].errorCode },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { added: succeeded.length, failed: failed.length, results },
  });
});
```

- [ ] **Step 5: Convert the remaining session-guarded routes**

Apply the same mechanical transformation (move body into `withAuth(async (req, session, ctx) => ...)`, drop the outer try/catch-401 and generic catch blocks, keep domain-specific catches, replace `const session = await requireSession()` with the injected `session`, replace `const { id } = await params`-style access with `const { id } = await ctx.params`). Convert these files:

- `app/api/articles/route.ts`, `app/api/articles/grouped/route.ts`, `app/api/articles/history/route.ts`, `app/api/articles/mark-all-read/route.ts`
- `app/api/articles/[id]/route.ts`, `app/api/articles/[id]/summarize/route.ts`, `app/api/articles/[id]/tag-suggestions/route.ts`, `app/api/articles/[id]/tags/route.ts`, `app/api/articles/[id]/tags/[tagId]/route.ts`
- `app/api/dashboard/stats/route.ts`, `app/api/dashboard/timeline/route.ts`
- `app/api/discover/route.ts`
- `app/api/email/llm/config/route.ts`, `app/api/email/llm/models/route.ts`, `app/api/email/llm/preview/route.ts`, `app/api/email/llm/test/route.ts`
- `app/api/feeds/route.ts` (done in Step 4), `app/api/feeds/[id]/route.ts`, `app/api/feeds/[id]/refresh/route.ts`, `app/api/feeds/auto-group/route.ts`, `app/api/feeds/auto-group/apply/route.ts`, `app/api/feeds/reorder/route.ts`, `app/api/feeds/sync/route.ts`
- `app/api/folders/route.ts`, `app/api/folders/[id]/route.ts`, `app/api/folders/reorder/route.ts`
- `app/api/opml/export/route.ts`, `app/api/opml/import/route.ts`
- `app/api/search/route.ts`, `app/api/search/ai/route.ts`
- `app/api/settings/route.ts`, `app/api/settings/account/route.ts`, `app/api/settings/email/route.ts`, `app/api/settings/email/test/route.ts`, `app/api/settings/email/history/route.ts`, `app/api/settings/email/history/[logId]/preview/route.ts`, `app/api/settings/email/history/[logId]/resend/route.ts`
- `app/api/tags/route.ts`, `app/api/webview/route.ts` (only if it requires a session — check first)

Do NOT convert (no session or special semantics): `app/api/auth/[...all]/route.ts`, `app/api/auth/register/route.ts`, `app/api/r/route.ts` (public click-tracking), `app/api/sse/route.ts` (streaming), `app/api/image-proxy/route.ts`, `app/api/oauth/approve/route.ts`, `app/api/oauth/register/route.ts` (check each — only convert if it follows the requireSession+JSON pattern).

Behavior caveats to preserve per-route: routes that currently return a non-generic 500 message or a special status must keep that behavior inside the handler (e.g. ai-search returns 502 on LLM failure). If a route's current catch returns `error.message` on 500, switching to the generic "Internal error" is the INTENDED change (security: no detail leaks) — but keep domain catches (FeedError, LLM errors) explicit in handlers.

- [ ] **Step 6: Run existing API tests, fix mocks if needed**

Run: `pnpm test tests/api`
Expected: PASS — `tests/api/search.test.ts` and the email-history tests exercise converted routes; they mock `@/lib/auth/session` which `withAuth` also uses, so they should pass unchanged.

- [ ] **Step 7: Build, full test, commit**

Run: `pnpm build && pnpm test`

```bash
git add -A
git commit -m "refactor(api): introduce withAuth wrapper, remove per-route auth/error boilerplate"
```

---

### Task 10: Sink AI-search business logic into lib/search/ai-search.ts

`app/api/search/ai/route.ts` (145 lines) inlines a DB query, prompt building, LLM call, and response validation. Extract the pure parts and the orchestrator.

**Files:**
- Create: `lib/search/ai-search.ts`
- Modify: `app/api/search/ai/route.ts`
- Test: `tests/search/ai-search.test.ts`

- [ ] **Step 1: Write the failing test for the pure response parser**

```typescript
// tests/search/ai-search.test.ts
import { describe, it, expect } from "vitest";
import { parseAiSearchResponse, buildArticleListBlock } from "@/lib/search/ai-search";

const pool = [
  { id: "a0", title: "T0", feedTitle: "F0", url: "https://e.com/0", summary: "s0" },
  { id: "a1", title: "T1", feedTitle: "F1", url: "https://e.com/1", summary: "s1" },
];

describe("parseAiSearchResponse", () => {
  it("maps valid indices to cited articles", () => {
    const out = parseAiSearchResponse({ answer: "ok", indices: [1] }, pool);
    expect(out.answer).toBe("ok");
    expect(out.articles).toEqual([
      { id: "a1", title: "T1", feedTitle: "F1", url: "https://e.com/1", summary: "s1" },
    ]);
  });

  it("drops out-of-range, negative, and non-integer indices", () => {
    const out = parseAiSearchResponse({ answer: "ok", indices: [-1, 0, 2, 1.5] }, pool);
    expect(out.articles.map((a) => a.id)).toEqual(["a0"]);
  });

  it("tolerates a malformed response shape", () => {
    const out = parseAiSearchResponse({ answer: 42, indices: "nope" }, pool);
    expect(out.answer).toBe("");
    expect(out.articles).toEqual([]);
  });
});

describe("buildArticleListBlock", () => {
  it("renders numbered entries with title, feed, summary", () => {
    const block = buildArticleListBlock(pool);
    expect(block).toContain("[0] T0 (F0)");
    expect(block).toContain("[1] T1 (F1)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement `lib/search/ai-search.ts`**

```typescript
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, feeds, subscriptions } from "@/lib/db/schema";
import { callChatCompletion, withLlmRetry } from "@/lib/digest/llm-client";
import type { LlmConfig } from "@/lib/digest/llm-config";

const ARTICLE_POOL_SIZE = 60;
const SEARCH_WINDOW_DAYS = 30;

export interface PooledArticle {
  id: string;
  title: string | null;
  feedTitle: string | null;
  url: string | null;
  summary: string | null;
}

export interface AiSearchAnswer {
  answer: string;
  articles: Array<{
    id: string;
    title: string | null;
    feedTitle: string | null;
    url: string | null;
    summary: string | null;
  }>;
}

export function buildArticleListBlock(pool: PooledArticle[]): string {
  return pool
    .map(
      (a, i) =>
        `[${i}] ${a.title ?? "(no title)"} (${a.feedTitle ?? ""})\n    ${(a.summary ?? "").slice(0, 240)}`,
    )
    .join("\n");
}

export function parseAiSearchResponse(response: unknown, pool: PooledArticle[]): AiSearchAnswer {
  const typed = response as { answer?: unknown; indices?: unknown };
  const answer = typeof typed.answer === "string" ? typed.answer : "";
  const indices = Array.isArray(typed.indices)
    ? typed.indices.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < pool.length)
    : [];
  return {
    answer,
    articles: indices.map((i) => ({
      id: pool[i].id,
      title: pool[i].title,
      feedTitle: pool[i].feedTitle,
      url: pool[i].url,
      summary: pool[i].summary,
    })),
  };
}

/** Answer a question about the user's recent articles via their LLM. */
export async function aiSearchArticles(
  userId: string,
  query: string,
  llmConfig: LlmConfig,
  chat: typeof callChatCompletion = callChatCompletion,
): Promise<AiSearchAnswer & { pool: number }> {
  const since = new Date(Date.now() - SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pool: PooledArticle[] = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      feedTitle: feeds.title,
      url: articles.url,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .where(gte(articles.createdAt, since))
    .orderBy(desc(articles.createdAt))
    .limit(ARTICLE_POOL_SIZE);

  if (pool.length === 0) {
    return { answer: "No recent articles to search.", articles: [], pool: 0 };
  }

  const response = await withLlmRetry(() =>
    chat(llmConfig, {
      system:
        "You answer questions about a user's news feed by referencing a list of recent articles. " +
        'Reply with JSON: { "answer": string, "indices": number[] }. ' +
        "Pick at most 5 article indices (by [N] number) that are relevant. " +
        "If no article is relevant, return an empty indices array and say so in answer. " +
        "Keep answer concise (max 4 sentences). Do not invent facts not in the articles.",
      user: `Question: ${query}\n\nRecent articles:\n${buildArticleListBlock(pool)}`,
      jsonSchema: {
        name: "ai_search",
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            indices: { type: "array", items: { type: "integer", minimum: 0 }, maxItems: 5 },
          },
          required: ["answer", "indices"],
        },
      },
    }),
  );

  return { ...parseAiSearchResponse(response, pool), pool: pool.length };
}
```

Run: `pnpm test tests/search/ai-search.test.ts`
Expected: PASS.

- [ ] **Step 3: Slim the route**

```typescript
// app/api/search/ai/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getUserLlmConfig } from "@/lib/digest/llm-config";
import { aiSearchArticles } from "@/lib/search/ai-search";

const SearchSchema = z.object({
  query: z.string().min(2).max(500),
});

export const POST = withAuth(async (req, session) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
  }

  const llmConfig = await getUserLlmConfig(session.user.id);
  if (!llmConfig) {
    return NextResponse.json(
      { success: false, error: "No LLM configured — set one in Settings → Smart Digest" },
      { status: 400 },
    );
  }

  try {
    const data = await aiSearchArticles(session.user.id, parsed.data.query, llmConfig);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
});
```

(Note: the old route returned 500 with "LLM key could not be decrypted" when `getUserLlmConfig` threw — since Task 2 the function returns null on decrypt failure, so the null branch covers it.)

- [ ] **Step 4: Build, test, commit**

Run: `pnpm build && pnpm test`

```bash
git add -A
git commit -m "refactor(search): extract aiSearchArticles into lib/search, slim API route"
```

---

### Task 11: Account/settings query module — stop raw Drizzle in routes, fix the email race

`app/api/settings/route.ts` and `app/api/settings/account/route.ts` query `users` directly. The email-uniqueness check races with concurrent updates — `users.email` has a UNIQUE constraint, so rely on it: catch the violation (Postgres error code 23505) instead of check-then-update.

**Files:**
- Create: `lib/db/queries/account.ts`
- Test: `tests/db/account.test.ts`
- Modify: `app/api/settings/route.ts`, `app/api/settings/account/route.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/db/account.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state: { updateError: unknown; updatedRow: Record<string, unknown> } = {
    updateError: null,
    updatedRow: { id: "u1", email: "new@e.com", name: "N" },
  };
  const db = {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            if (state.updateError) throw state.updateError;
            return [state.updatedRow];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => [{ id: "u1", email: "a@e.com", name: "N", image: null, createdAt: new Date(), settings: { theme: "dark" } }],
      }),
    }),
  };
  return { db, state };
});

vi.mock("@/lib/db", () => ({ db: h.db }));

import { updateAccount, getAccount, getUserSettings } from "@/lib/db/queries/account";

beforeEach(() => {
  h.state.updateError = null;
});

describe("updateAccount", () => {
  it("returns ok with the updated row", async () => {
    const out = await updateAccount("u1", { email: "new@e.com" });
    expect(out).toEqual({ ok: true, account: h.state.updatedRow });
  });

  it("maps a unique violation to email-taken instead of throwing", async () => {
    h.state.updateError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const out = await updateAccount("u1", { email: "taken@e.com" });
    expect(out).toEqual({ ok: false, reason: "email-taken" });
  });

  it("detects unique violations wrapped in a cause", async () => {
    h.state.updateError = Object.assign(new Error("query failed"), {
      cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
    });
    const out = await updateAccount("u1", { email: "taken@e.com" });
    expect(out).toEqual({ ok: false, reason: "email-taken" });
  });

  it("rethrows other errors", async () => {
    h.state.updateError = new Error("connection lost");
    await expect(updateAccount("u1", { name: "X" })).rejects.toThrow("connection lost");
  });
});

describe("getAccount / getUserSettings", () => {
  it("returns the account row", async () => {
    const acc = await getAccount("u1");
    expect(acc).toMatchObject({ id: "u1", email: "a@e.com" });
  });

  it("returns settings object", async () => {
    expect(await getUserSettings("u1")).toEqual({ theme: "dark" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails, then implement `lib/db/queries/account.ts`**

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export interface AccountUpdate {
  name?: string;
  email?: string;
}

export type UpdateAccountResult =
  | { ok: true; account: Record<string, unknown> }
  | { ok: false; reason: "email-taken" };

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; cause?: unknown };
  if (e.code === "23505") return true;
  return isUniqueViolation(e.cause);
}

export async function getAccount(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  return user ?? null;
}

/**
 * Update name/email. Email uniqueness is enforced by the DB constraint —
 * a violation maps to { ok: false, reason: "email-taken" } so concurrent
 * updates can't race past a check-then-set.
 */
export async function updateAccount(
  userId: string,
  data: AccountUpdate,
): Promise<UpdateAccountResult> {
  try {
    const [updated] = await db
      .update(users)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return { ok: true, account: updated };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "email-taken" };
    throw err;
  }
}

export async function getUserSettings(userId: string): Promise<Record<string, unknown>> {
  const [user] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId));
  return (user?.settings as Record<string, unknown>) ?? {};
}

export async function patchUserSettings(
  userId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const current = await getUserSettings(userId);
  const merged = { ...current, ...patch };
  await db.update(users).set({ settings: merged }).where(eq(users.id, userId));
  return merged;
}
```

Run: `pnpm test tests/db/account.test.ts`
Expected: PASS.

- [ ] **Step 3: Rewrite the two routes to use the module (and withAuth from Task 9)**

```typescript
// app/api/settings/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getUserSettings, patchUserSettings } from "@/lib/db/queries/account";

const SettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export type UserSettings = z.infer<typeof SettingsSchema>;

export const GET = withAuth(async (_req, session) => {
  const settings = await getUserSettings(session.user.id);
  return NextResponse.json({ success: true, data: settings });
});

export const PATCH = withAuth(async (req, session) => {
  const body = await req.json();
  const patch = SettingsSchema.parse(body);
  const merged = await patchUserSettings(session.user.id, patch);
  return NextResponse.json({ success: true, data: merged });
});
```

```typescript
// app/api/settings/account/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getAccount, updateAccount } from "@/lib/db/queries/account";

const updateSchema = z.object({
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
});

export const GET = withAuth(async (_req, session) => {
  const account = await getAccount(session.user.id);
  return NextResponse.json({ success: true, data: account });
});

export const PUT = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = updateSchema.parse(body);

  const result = await updateAccount(session.user.id, parsed);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: "Email already in use" }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: result.account });
});
```

- [ ] **Step 4: Build, test, commit**

Run: `pnpm build && pnpm test`

```bash
git add -A
git commit -m "refactor(settings): account query module, fix email-uniqueness race via DB constraint"
```

---

### Task 12: Final verification sweep

- [ ] **Step 1: Stale-reference sweep**

```bash
grep -rn "email/queries" app lib tests components        # expect: nothing
grep -rn "digest/cluster\b\|digest/organize\b\|digest/consolidate" app lib tests  # expect: nothing
grep -rn "markArticlesAsSent" lib/jobs                    # expect: nothing (recordDigestSent now)
```

- [ ] **Step 2: Full verification**

Run: `pnpm build && pnpm test`
Expected: clean build, all tests green.

- [ ] **Step 3: Review the diff against main**

Run: `git diff main --stat`
Sanity-check: no unrelated files touched; `lib/email/queries.ts` deleted; new modules present.

- [ ] **Step 4: Commit any leftovers**

```bash
git status --short   # should be clean; commit stragglers if any
```

---

## Self-review checklist (done at plan time)

- Spec coverage: candidate 7 → Task 1; candidate 1 → Tasks 2–3; candidate 2 → Tasks 4+6 (orchestration tests in Task 6 Step 7); candidate 3 → Tasks 5+7; candidate 6 → Task 8; candidate 4 → Tasks 9–11; gating requirement → Task 6. Candidate 5 (Reader UI) explicitly deferred to Plan B.
- Types consistent: `TagBatchResult` fields (`attempted/tagged/failed/rateLimited`) used identically in Tasks 5, 6, 7; `TagGateOutcome` (`ready/retagged` | `postponed/reason`) used identically in Task 6 worker wiring and tests; `recordDigestSent(userId, articleIds, articleCount)` signature identical in Tasks 4 and 6.
- Known risk: drizzle mock shapes in Tasks 4/8/11 must match the actual call chains — if a chain differs (e.g. `.returning()` not called), adjust the mock to the real code, not the other way around.
