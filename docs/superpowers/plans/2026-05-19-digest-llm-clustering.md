# Digest LLM Clustering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the daily digest email so candidate articles are deduped (URL + title), grouped by topic via an OpenAI-compatible LLM, and ranked by importance — with a clean fallback whenever LLM is missing or fails. Also encrypt all SMTP/LLM secret fields at rest.

**Architecture:** New `lib/digest/` pipeline (normalize → dedupe → cluster → organize) feeds a view-model into refactored email templates. New `lib/crypto/secrets.ts` provides AES-256-GCM helpers; `lib/email/queries.ts` becomes the encryption boundary so all callers see plaintext secrets. Worker (`lib/jobs/workers/digest-worker.ts`) wires it together with hard guarantees: every input article reaches the inbox, LLM failure never blocks sending, encryption key is required at startup.

**Tech Stack:** TypeScript, Next.js 16, Drizzle, Vitest, Zod, node:crypto, fetch-based OpenAI-compatible client. New devDeps: `zod-to-json-schema`, `fast-check`.

**Source spec:** `docs/superpowers/specs/2026-05-19-digest-llm-clustering-design.md`

**Deviations from spec captured here:**
- Email templates are `.ts` string renderers, not `.tsx` (matches existing `lib/email/sender.ts` pattern; avoids react-email dependency)
- Playwright E2E demoted to a manual smoke checklist (Task 14); adding Playwright is its own follow-up

---

## File Structure

**New files (in dependency order — earlier files don't import later):**

```
lib/crypto/secrets.ts                      AES-256-GCM, ENCRYPTION_KEY-driven
lib/crypto/startup-check.ts                Throws at import if ENCRYPTION_KEY missing/invalid
lib/digest/normalize-url.ts                Pure URL canonicalization
lib/digest/dedupe.ts                       Rule-based dedupe (URL + title Jaccard)
lib/digest/cluster-types.ts                Zod schemas + types for LLM I/O
lib/digest/llm-client.ts                   Fetch wrapper for OpenAI-compatible Chat Completions
lib/digest/cluster.ts                      Build prompt, call LLM, validate, batch logic
lib/digest/fallback.ts                     Build OrganizedDigest in fallback mode
lib/digest/organize.ts                     Combine dedupe output + clusters → OrganizedDigest
lib/digest/types.ts                        OrganizedDigest, DedupedArticle types
lib/email/templates/digest-html.ts         Render OrganizedDigest → html string
lib/email/templates/digest-fallback-html.ts Existing layout, slightly adjusted

drizzle/scripts/encrypt-existing-secrets.ts One-time idempotent secret migration

app/api/email/llm/config/route.ts          PUT save config
app/api/email/llm/test/route.ts            POST ping with form values

tests/crypto/secrets.test.ts
tests/digest/normalize-url.test.ts
tests/digest/dedupe.test.ts
tests/digest/cluster-types.test.ts
tests/digest/llm-client.test.ts
tests/digest/cluster.test.ts
tests/digest/fallback.test.ts
tests/digest/organize.test.ts
tests/email/templates/digest-html.test.ts
tests/email/templates/digest-fallback-html.test.ts
tests/jobs/digest-worker.test.ts
tests/api/llm-test.test.ts
tests/fixtures/digest/*.json
```

**Modified files:**

```
lib/db/schema.ts                                Add llm_* columns
lib/email/queries.ts                            Encrypt-on-write / decrypt-on-read for smtp_pass, email_api_key, llm_api_key; new llm config getter
lib/email/sender.ts                             Accept html string from caller; remove inline HTML building
lib/jobs/workers/digest-worker.ts               Insert pipeline before sendDailyDigest
lib/jobs/start-workers.ts                       Import startup-check
app/layout.tsx (or instrumentation.ts)          Import startup-check (server entry)
app/(reader)/settings/page.tsx                  Insert Smart Digest (Beta) card + form action wiring
.env.example                                    Add ENCRYPTION_KEY guidance
README.md                                       Deployment steps: ENCRYPTION_KEY + encrypt script
package.json                                    Add zod-to-json-schema, fast-check; new test scripts
```

---

## Task 0: Preflight & dependencies

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install new deps**

Run:
```bash
cd /Users/ashark/Code/my-apps/apps/feedwise
pnpm add zod-to-json-schema
pnpm add -D fast-check
```

Expected: both installed successfully.

- [ ] **Step 2: Verify Vitest baseline still runs**

Run:
```bash
pnpm test --reporter=basic
```

Expected: existing tests pass (auth, feed-interval, oauth-pkce). If `auth.test.ts` fails because no dev server, that's fine — note it; it's an integration test requiring a running server.

- [ ] **Step 3: Add ENCRYPTION_KEY to .env.example**

Open `.env.example`, append:

```env

# Required: 32-byte key (base64-encoded) used to encrypt secrets at rest.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore: add zod-to-json-schema, fast-check, ENCRYPTION_KEY guidance"
```

---

## Task 1: lib/crypto/secrets.ts (encryption primitives)

**Files:**
- Create: `lib/crypto/secrets.ts`
- Create: `tests/crypto/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/crypto/secrets.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

const VALID_KEY = randomBytes(32).toString("base64");

describe("lib/crypto/secrets", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEnv;
  });

  it("encrypts and decrypts a string roundtrip", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/secrets");
    const plain = "sk-test-1234567890abcdef";
    const ciphertext = encryptSecret(plain);
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(ciphertext).not.toContain(plain);
    expect(decryptSecret(ciphertext)).toBe(plain);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto/secrets");
    expect(encryptSecret("same-plain")).not.toBe(encryptSecret("same-plain"));
  });

  it("isEncrypted detects v1 prefix", async () => {
    const { isEncrypted, encryptSecret } = await import("@/lib/crypto/secrets");
    expect(isEncrypted("plain-string")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
  });

  it("throws SecretDecryptionError on tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret, SecretDecryptionError } = await import(
      "@/lib/crypto/secrets"
    );
    const ct = encryptSecret("hello");
    // Flip a char in the ciphertext segment (index 3 onwards)
    const parts = ct.split(":");
    const tamperedCipher = parts[2].slice(0, -2) + (parts[2].endsWith("A") ? "B" : "A") + "=";
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCipher}:${parts[3]}`;
    expect(() => decryptSecret(tampered)).toThrow(SecretDecryptionError);
  });

  it("throws SecretDecryptionError on malformed input", async () => {
    const { decryptSecret, SecretDecryptionError } = await import("@/lib/crypto/secrets");
    expect(() => decryptSecret("not-encrypted")).toThrow(SecretDecryptionError);
    expect(() => decryptSecret("v1:only:two")).toThrow(SecretDecryptionError);
    expect(() => decryptSecret("v2:a:b:c")).toThrow(SecretDecryptionError); // unknown version
  });

  it("throws if ENCRYPTION_KEY missing", async () => {
    delete process.env.ENCRYPTION_KEY;
    // Re-import after mutating env: use vitest's import.meta or just re-require
    const mod = await import("@/lib/crypto/secrets?missingkey" as string).catch((e) => e);
    // Easier: validate via assertKeyConfigured()
    process.env.ENCRYPTION_KEY = VALID_KEY;
    const { assertKeyConfigured } = await import("@/lib/crypto/secrets");
    delete process.env.ENCRYPTION_KEY;
    expect(() => assertKeyConfigured()).toThrow(/ENCRYPTION_KEY/);
  });

  it("throws if ENCRYPTION_KEY wrong length", async () => {
    process.env.ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    const { assertKeyConfigured } = await import("@/lib/crypto/secrets");
    expect(() => assertKeyConfigured()).toThrow(/32 bytes/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/crypto/secrets.test.ts
```

Expected: FAIL (`Cannot find module '@/lib/crypto/secrets'`).

- [ ] **Step 3: Implement secrets.ts**

Create `lib/crypto/secrets.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = "v1";

export class SecretDecryptionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "SecretDecryptionError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY env var is required for secret encryption");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key;
}

export function assertKeyConfigured(): void {
  loadKey();
}

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(`${VERSION}:`)) {
    throw new SecretDecryptionError(`Unsupported secret format (expected ${VERSION}: prefix)`);
  }
  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new SecretDecryptionError("Malformed encrypted secret (expected 4 segments)");
  }
  const [, ivB64, ctB64, tagB64] = parts;
  let iv: Buffer, ct: Buffer, tag: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    ct = Buffer.from(ctB64, "base64");
    tag = Buffer.from(tagB64, "base64");
  } catch (e) {
    throw new SecretDecryptionError("Base64 decode failed", e);
  }
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new SecretDecryptionError("IV or auth tag has wrong length");
  }
  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8");
  } catch (e) {
    throw new SecretDecryptionError("Authentication tag mismatch (key wrong or ciphertext tampered)", e);
  }
}

/**
 * Decrypt only if value looks encrypted; otherwise return as-is.
 * Used during migration when DB may contain mixed plaintext + ciphertext.
 */
export function decryptIfEncrypted(value: string | null): string | null {
  if (value == null) return null;
  return isEncrypted(value) ? decryptSecret(value) : value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm test tests/crypto/secrets.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crypto/secrets.ts tests/crypto/secrets.test.ts
git commit -m "feat: add AES-256-GCM secret encryption with v1 ciphertext format"
```

---

## Task 2: Startup ENCRYPTION_KEY guard

**Files:**
- Create: `lib/crypto/startup-check.ts`
- Modify: `lib/jobs/start-workers.ts`
- Create: `instrumentation.ts` (project root)

- [ ] **Step 1: Implement startup-check.ts**

Create `lib/crypto/startup-check.ts`:

```ts
import { assertKeyConfigured } from "./secrets";

/**
 * Call once at process entry (web server boot, worker boot).
 * Fail-fast: throws synchronously if ENCRYPTION_KEY missing or wrong size.
 */
export function ensureEncryptionConfigured(): void {
  try {
    assertKeyConfigured();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[startup] FATAL: ${msg}`);
    throw err;
  }
}
```

- [ ] **Step 2: Wire into worker boot**

Open `lib/jobs/start-workers.ts`. Add at the very top (after imports):

```ts
import { ensureEncryptionConfigured } from "@/lib/crypto/startup-check";
ensureEncryptionConfigured();
```

- [ ] **Step 3: Wire into Next.js server boot via instrumentation hook**

Create `instrumentation.ts` at project root (Next.js auto-imports this on server start; verify against `node_modules/next/dist/docs/` if behavior surprises):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureEncryptionConfigured } = await import("@/lib/crypto/startup-check");
    ensureEncryptionConfigured();
  }
}
```

- [ ] **Step 4: Verify boot fails without key**

Run:
```bash
ENCRYPTION_KEY="" pnpm worker 2>&1 | head -5
```

Expected: process exits with the "ENCRYPTION_KEY env var is required" error.

- [ ] **Step 5: Verify boot succeeds with valid key**

Run:
```bash
ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" pnpm worker 2>&1 | head -5 &
sleep 2
kill %1 2>/dev/null || true
```

Expected: worker prints normal startup banner, no error.

- [ ] **Step 6: Commit**

```bash
git add lib/crypto/startup-check.ts lib/jobs/start-workers.ts instrumentation.ts
git commit -m "feat: fail-fast on missing ENCRYPTION_KEY at server and worker boot"
```

---

## Task 3: Schema additions (LLM columns)

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add new columns to emailSubscriptions**

Open `lib/db/schema.ts`. Find the `emailSubscriptions` table (around line 204). Inside the column block, insert these four lines right before `createdAt`:

```ts
    llmEnabled: boolean("llm_enabled").notNull().default(false),
    llmBaseUrl: varchar("llm_base_url", { length: 500 }),
    llmApiKey: text("llm_api_key"),
    llmModel: varchar("llm_model", { length: 100 }),
```

- [ ] **Step 2: Generate migration**

Run:
```bash
pnpm db:generate
```

Expected: a new migration file in `drizzle/` adds the four columns. Inspect the generated SQL to confirm `llm_enabled boolean NOT NULL DEFAULT false`.

- [ ] **Step 3: Apply migration**

Run:
```bash
pnpm db:push
```

Expected: schema synced.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add llm_* columns to email_subscriptions"
```

---

## Task 4: Encrypt-existing-secrets migration script

**Files:**
- Create: `drizzle/scripts/encrypt-existing-secrets.ts`

- [ ] **Step 1: Implement the script**

Create `drizzle/scripts/encrypt-existing-secrets.ts`:

```ts
/**
 * One-time idempotent migration: encrypt smtp_pass + email_api_key + llm_api_key
 * for any rows storing plaintext (no v1: prefix). Safe to re-run.
 *
 * Usage: pnpm tsx --env-file=.env drizzle/scripts/encrypt-existing-secrets.ts
 */
import { ensureEncryptionConfigured } from "@/lib/crypto/startup-check";
ensureEncryptionConfigured();

import { db } from "@/lib/db";
import { emailSubscriptions } from "@/lib/db/schema";
import { encryptSecret, isEncrypted } from "@/lib/crypto/secrets";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      id: emailSubscriptions.id,
      smtpPass: emailSubscriptions.smtpPass,
      emailApiKey: emailSubscriptions.emailApiKey,
      llmApiKey: emailSubscriptions.llmApiKey,
    })
    .from(emailSubscriptions);

  let updated = 0;
  for (const row of rows) {
    const update: Partial<{ smtpPass: string; emailApiKey: string; llmApiKey: string }> = {};
    if (row.smtpPass && !isEncrypted(row.smtpPass)) {
      update.smtpPass = encryptSecret(row.smtpPass);
    }
    if (row.emailApiKey && !isEncrypted(row.emailApiKey)) {
      update.emailApiKey = encryptSecret(row.emailApiKey);
    }
    if (row.llmApiKey && !isEncrypted(row.llmApiKey)) {
      update.llmApiKey = encryptSecret(row.llmApiKey);
    }
    if (Object.keys(update).length > 0) {
      await db.update(emailSubscriptions).set(update).where(eq(emailSubscriptions.id, row.id));
      updated++;
    }
  }

  console.log(`[encrypt-existing-secrets] scanned ${rows.length} rows, encrypted ${updated}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[encrypt-existing-secrets] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Open `package.json`. Inside `scripts`, add:

```json
    "db:encrypt-secrets": "tsx --env-file=.env drizzle/scripts/encrypt-existing-secrets.ts",
```

- [ ] **Step 3: Run on local DB (assuming local has existing plaintext secrets, or no rows)**

Run:
```bash
pnpm db:encrypt-secrets
```

Expected: prints `scanned N rows, encrypted M`. Re-run:

```bash
pnpm db:encrypt-secrets
```

Expected: `encrypted 0` (idempotent).

- [ ] **Step 4: Commit**

```bash
git add drizzle/scripts/encrypt-existing-secrets.ts package.json
git commit -m "feat: add idempotent script to encrypt existing plaintext secrets"
```

---

## Task 5: Update email/queries.ts to encrypt-on-write / decrypt-on-read

**Files:**
- Modify: `lib/email/queries.ts`

This task makes `lib/email/queries.ts` the encryption boundary: secrets stored encrypted, all callers see plaintext.

- [ ] **Step 1: Import crypto helpers**

Open `lib/email/queries.ts`. Add to the imports at top:

```ts
import { encryptSecret, decryptIfEncrypted } from "@/lib/crypto/secrets";
```

- [ ] **Step 2: Decrypt in getSubscriptionSettings**

Find `getSubscriptionSettings`. Update the returned object's secret fields to decrypt:

```ts
  return {
    enabled: sub.enabled,
    sendTime: sub.sendTime ?? "08:00",
    frequency: sub.frequency ?? "daily",
    cronExpression: sub.cronExpression ?? null,
    selectedTags: tagRows.map((r) => r.tagId),
    selectedFeeds: feedRows.map((r) => r.feedId),
    smtpHost: sub.smtpHost,
    smtpPort: sub.smtpPort,
    smtpUser: sub.smtpUser,
    smtpPass: decryptIfEncrypted(sub.smtpPass),
    smtpFrom: sub.smtpFrom,
    emailProvider: sub.emailProvider,
    emailApiKey: decryptIfEncrypted(sub.emailApiKey),
  };
```

- [ ] **Step 3: Encrypt in updateSubscriptionSettings**

Find `updateSubscriptionSettings`. Add this helper above the function (file scope):

```ts
function encryptIfPresent(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (value === "") return null;
  return encryptSecret(value);
}
```

In the `insert` branch, change `smtpPass: settings.smtpPass` to `smtpPass: encryptIfPresent(settings.smtpPass) ?? null` and same for `emailApiKey`.

In the `update` branch, change the conditional update for both fields:

```ts
      smtpPass: settings.smtpPass !== undefined ? encryptIfPresent(settings.smtpPass) ?? null : existing.smtpPass,
      // ... existing fields ...
      emailApiKey: settings.emailApiKey !== undefined ? encryptIfPresent(settings.emailApiKey) ?? null : existing.emailApiKey,
```

- [ ] **Step 4: Decrypt in getAllActiveSubscriptions**

Find `getAllActiveSubscriptions`. Wrap the return so callers (worker) get plaintext smtpPass:

```ts
export async function getAllActiveSubscriptions() {
  const rows = await db
    .select({
      id: emailSubscriptions.id,
      userId: emailSubscriptions.userId,
      sendTime: emailSubscriptions.sendTime,
      frequency: emailSubscriptions.frequency,
      cronExpression: emailSubscriptions.cronExpression,
      nextScheduledAt: emailSubscriptions.nextScheduledAt,
      lastSentAt: emailSubscriptions.lastSentAt,
      smtpHost: emailSubscriptions.smtpHost,
      smtpPort: emailSubscriptions.smtpPort,
      smtpUser: emailSubscriptions.smtpUser,
      smtpPass: emailSubscriptions.smtpPass,
      smtpFrom: emailSubscriptions.smtpFrom,
    })
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.enabled, true));
  return rows.map((r) => ({ ...r, smtpPass: decryptIfEncrypted(r.smtpPass) }));
}
```

- [ ] **Step 5: Update getUserSMTPConfig**

Find `getUserSMTPConfig`. Update the `pass` field:

```ts
  return {
    host: sub.smtpHost,
    port: sub.smtpPort || 587,
    user: sub.smtpUser,
    pass: decryptIfEncrypted(sub.smtpPass) ?? "",
    from: sub.smtpFrom || "Feedwise <noreply@feedwise.app>",
  };
```

(If `decryptIfEncrypted` returns `null`, the earlier `!sub.smtpPass` guard would have already returned. The `?? ""` keeps types clean.)

- [ ] **Step 6: Add new getter — getUserLlmConfig**

Append at the end of `lib/email/queries.ts`:

```ts
export interface LlmConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export async function getUserLlmConfig(userId: string): Promise<LlmConfig | null> {
  const sub = await getUserSubscription(userId);
  if (!sub || !sub.llmEnabled || !sub.llmBaseUrl || !sub.llmApiKey || !sub.llmModel) {
    return null;
  }
  return {
    enabled: true,
    baseUrl: sub.llmBaseUrl,
    apiKey: decryptIfEncrypted(sub.llmApiKey) ?? "",
    model: sub.llmModel,
  };
}

export interface LlmConfigInput {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string; // undefined = keep existing
  model: string;
}

export async function updateUserLlmConfig(userId: string, input: LlmConfigInput): Promise<void> {
  const existing = await getUserSubscription(userId);
  const apiKeyToStore =
    input.apiKey === undefined
      ? existing?.llmApiKey ?? null
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
      updatedAt: new Date(),
    })
    .where(eq(emailSubscriptions.id, existing.id));
}
```

- [ ] **Step 7: Quick smoke test via Vitest (no new test file yet, just typecheck)**

Run:
```bash
pnpm tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/email/queries.ts
git commit -m "feat(email): encrypt smtp_pass/email_api_key/llm_api_key at rest; add LLM config getters"
```

---

## Task 6: lib/digest/normalize-url.ts

**Files:**
- Create: `lib/digest/normalize-url.ts`
- Create: `tests/digest/normalize-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/digest/normalize-url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canonicalizeUrl } from "@/lib/digest/normalize-url";

describe("canonicalizeUrl", () => {
  it("strips utm_* tracking params", () => {
    expect(canonicalizeUrl("https://example.com/a?utm_source=x&utm_medium=y&id=1")).toBe(
      "https://example.com/a?id=1"
    );
  });

  it("strips fbclid, gclid, ref, ref_src", () => {
    expect(canonicalizeUrl("https://example.com/a?fbclid=abc&gclid=def&ref=g&ref_src=h&id=1")).toBe(
      "https://example.com/a?id=1"
    );
  });

  it("removes URL fragment", () => {
    expect(canonicalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("lowercases scheme and host", () => {
    expect(canonicalizeUrl("HTTPS://Example.COM/Path")).toBe("https://example.com/Path");
  });

  it("strips trailing slash from non-root paths", () => {
    expect(canonicalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("returns input unchanged for invalid URL", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
    expect(canonicalizeUrl("")).toBe("");
  });

  it("preserves query order after filtering", () => {
    const url = "https://e.com/p?b=2&utm_source=x&a=1";
    const out = canonicalizeUrl(url);
    expect(out).toBe("https://e.com/p?b=2&a=1");
  });

  it("handles null/undefined safely", () => {
    expect(canonicalizeUrl(null)).toBe("");
    expect(canonicalizeUrl(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/digest/normalize-url.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement normalize-url.ts**

Create `lib/digest/normalize-url.ts`:

```ts
const STRIP_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
  "mc_cid",
  "mc_eid",
  "yclid",
]);

export function canonicalizeUrl(input: string | null | undefined): string {
  if (input == null) return "";
  const raw = input.trim();
  if (raw === "") return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  const keep: Array<[string, string]> = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (STRIP_PARAMS.has(k.toLowerCase())) continue;
    if (k.toLowerCase().startsWith("utm_")) continue;
    keep.push([k, v]);
  }
  url.search = "";
  for (const [k, v] of keep) url.searchParams.append(k, v);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm test tests/digest/normalize-url.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/digest/normalize-url.ts tests/digest/normalize-url.test.ts
git commit -m "feat(digest): URL canonicalization (strip utm/tracking, fragment, trailing slash)"
```

---

## Task 7: lib/digest/dedupe.ts + lib/digest/types.ts

**Files:**
- Create: `lib/digest/types.ts`
- Create: `lib/digest/dedupe.ts`
- Create: `tests/digest/dedupe.test.ts`

- [ ] **Step 1: Create types.ts**

Create `lib/digest/types.ts`:

```ts
import type { EmailArticle } from "@/lib/email/sender";

export type DigestArticle = EmailArticle;

export interface DedupedArticle {
  primary: DigestArticle;
  duplicates: DigestArticle[];
}

export interface TopHeadline {
  cluster: import("./cluster-types").Cluster;
  primaryArticle: DigestArticle;
  sourceCount: number;
}

export interface TopicGroup {
  topic: string;
  totalCount: number;
  clusters: Array<{
    cluster: import("./cluster-types").Cluster;
    primary: DigestArticle;
    duplicates: DigestArticle[];
  }>;
}

export type DigestMode = "clustered" | "fallback-no-config" | "fallback-llm-failed";

export interface OrganizedDigest {
  date: Date;
  totalArticles: number;
  topicCount: number;
  topHeadlines: TopHeadline[];
  topicGroups: TopicGroup[];
  ungrouped: DigestArticle[];
  mode: DigestMode;
}
```

- [ ] **Step 2: Write the failing test for dedupe**

Create `tests/digest/dedupe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dedupeByCanonicalUrl, dedupeByTitleSimilarity } from "@/lib/digest/dedupe";
import type { DigestArticle } from "@/lib/digest/types";

function art(over: Partial<DigestArticle> = {}): DigestArticle {
  return {
    id: over.id ?? crypto.randomUUID(),
    title: over.title ?? "default",
    url: over.url ?? "https://example.com/" + (over.id ?? "x"),
    summary: over.summary ?? null,
    feedTitle: over.feedTitle ?? "feed",
    publishedAt: over.publishedAt ?? new Date("2026-05-19T00:00:00Z"),
  };
}

describe("dedupeByCanonicalUrl", () => {
  it("merges exact-URL duplicates, primary = earliest publishedAt", () => {
    const a = art({ id: "a", url: "https://e.com/x?utm_source=hn", publishedAt: new Date("2026-05-19T05:00:00Z") });
    const b = art({ id: "b", url: "https://e.com/x", publishedAt: new Date("2026-05-19T03:00:00Z") });
    const c = art({ id: "c", url: "https://e.com/y" });
    const out = dedupeByCanonicalUrl([a, b, c]);
    expect(out).toHaveLength(2);
    const merged = out.find((d) => d.duplicates.length > 0)!;
    expect(merged.primary.id).toBe("b");
    expect(merged.duplicates.map((d) => d.id)).toEqual(["a"]);
  });

  it("keeps singleton with empty duplicates", () => {
    const a = art({ id: "a" });
    const out = dedupeByCanonicalUrl([a]);
    expect(out).toEqual([{ primary: a, duplicates: [] }]);
  });

  it("handles empty input", () => {
    expect(dedupeByCanonicalUrl([])).toEqual([]);
  });

  it("treats empty/invalid URL as unique", () => {
    const a = art({ id: "a", url: "" });
    const b = art({ id: "b", url: "" });
    const out = dedupeByCanonicalUrl([a, b]);
    expect(out).toHaveLength(2);
  });
});

describe("dedupeByTitleSimilarity", () => {
  it("merges high-similarity titles (Jaccard >= 0.85)", () => {
    const a = { primary: art({ id: "a", title: "OpenAI launches GPT-5 with vision support" }), duplicates: [] };
    const b = { primary: art({ id: "b", title: "OpenAI launches GPT-5 with vision support today" }), duplicates: [] };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(1);
    expect(out[0].duplicates.map((d) => d.id)).toContain("b");
  });

  it("keeps distinct titles separate (Jaccard < 0.85)", () => {
    const a = { primary: art({ id: "a", title: "OpenAI launches GPT-5" }), duplicates: [] };
    const b = { primary: art({ id: "b", title: "Anthropic releases new Claude model" }), duplicates: [] };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(2);
  });

  it("primary keeps earlier publishedAt when merging", () => {
    const a = { primary: art({ id: "a", title: "Bun 2.0 released today", publishedAt: new Date("2026-05-19T10:00:00Z") }), duplicates: [] };
    const b = { primary: art({ id: "b", title: "Bun 2.0 released today now", publishedAt: new Date("2026-05-19T08:00:00Z") }), duplicates: [] };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(1);
    expect(out[0].primary.id).toBe("b");
  });

  it("ignores null/empty titles", () => {
    const a = { primary: art({ id: "a", title: "" }), duplicates: [] };
    const b = { primary: art({ id: "b", title: "" }), duplicates: [] };
    const out = dedupeByTitleSimilarity([a, b], 0.85);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
pnpm test tests/digest/dedupe.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement dedupe.ts**

Create `lib/digest/dedupe.ts`:

```ts
import { canonicalizeUrl } from "./normalize-url";
import type { DigestArticle, DedupedArticle } from "./types";

function pickPrimary(articles: DigestArticle[]): DigestArticle {
  return articles.reduce((earliest, a) => {
    const ea = earliest.publishedAt?.getTime() ?? Infinity;
    const aa = a.publishedAt?.getTime() ?? Infinity;
    return aa < ea ? a : earliest;
  });
}

export function dedupeByCanonicalUrl(articles: DigestArticle[]): DedupedArticle[] {
  const groups = new Map<string, DigestArticle[]>();
  const singletons: DigestArticle[] = [];

  for (const a of articles) {
    const canonical = canonicalizeUrl(a.url);
    if (!canonical) {
      singletons.push(a);
      continue;
    }
    const existing = groups.get(canonical);
    if (existing) existing.push(a);
    else groups.set(canonical, [a]);
  }

  const out: DedupedArticle[] = [];
  for (const grouped of groups.values()) {
    const primary = pickPrimary(grouped);
    const duplicates = grouped.filter((a) => a.id !== primary.id);
    out.push({ primary, duplicates });
  }
  for (const a of singletons) out.push({ primary: a, duplicates: [] });
  return out;
}

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function dedupeByTitleSimilarity(
  items: DedupedArticle[],
  threshold: number
): DedupedArticle[] {
  const result: DedupedArticle[] = [];
  for (const item of items) {
    const title = item.primary.title?.trim() ?? "";
    if (title === "") {
      result.push(item);
      continue;
    }
    const tokens = tokenize(title);
    let merged = false;
    for (const existing of result) {
      const existingTitle = existing.primary.title?.trim() ?? "";
      if (existingTitle === "") continue;
      const existingTokens = tokenize(existingTitle);
      if (jaccard(tokens, existingTokens) >= threshold) {
        const combined: DigestArticle[] = [
          existing.primary,
          ...existing.duplicates,
          item.primary,
          ...item.duplicates,
        ];
        const newPrimary = pickPrimary(combined);
        existing.primary = newPrimary;
        existing.duplicates = combined.filter((c) => c.id !== newPrimary.id);
        merged = true;
        break;
      }
    }
    if (!merged) result.push(item);
  }
  return result;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm test tests/digest/dedupe.test.ts
```

Expected: all dedupe tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/digest/types.ts lib/digest/dedupe.ts tests/digest/dedupe.test.ts
git commit -m "feat(digest): URL + title-similarity dedupe with earliest-publish primary"
```

---

## Task 8: lib/digest/cluster-types.ts

**Files:**
- Create: `lib/digest/cluster-types.ts`
- Create: `tests/digest/cluster-types.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/digest/cluster-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ClusterSchema, ClusterResponseSchema } from "@/lib/digest/cluster-types";

const validId = "11111111-1111-1111-1111-111111111111";

describe("ClusterSchema", () => {
  it("accepts a valid cluster", () => {
    const ok = ClusterSchema.safeParse({
      topic: "AI",
      headline: "OpenAI ships GPT-5",
      importance: 8,
      articleIds: [validId],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects empty topic", () => {
    const r = ClusterSchema.safeParse({ topic: "", headline: "x", importance: 5, articleIds: [validId] });
    expect(r.success).toBe(false);
  });

  it("rejects topic > 40 chars", () => {
    const r = ClusterSchema.safeParse({ topic: "x".repeat(41), headline: "x", importance: 5, articleIds: [validId] });
    expect(r.success).toBe(false);
  });

  it("rejects headline > 120 chars", () => {
    const r = ClusterSchema.safeParse({
      topic: "AI",
      headline: "x".repeat(121),
      importance: 5,
      articleIds: [validId],
    });
    expect(r.success).toBe(false);
  });

  it("rejects importance out of 1-10", () => {
    expect(
      ClusterSchema.safeParse({ topic: "AI", headline: "x", importance: 0, articleIds: [validId] }).success
    ).toBe(false);
    expect(
      ClusterSchema.safeParse({ topic: "AI", headline: "x", importance: 11, articleIds: [validId] }).success
    ).toBe(false);
  });

  it("rejects non-uuid articleIds", () => {
    const r = ClusterSchema.safeParse({ topic: "AI", headline: "x", importance: 5, articleIds: ["not-uuid"] });
    expect(r.success).toBe(false);
  });

  it("rejects empty articleIds array", () => {
    const r = ClusterSchema.safeParse({ topic: "AI", headline: "x", importance: 5, articleIds: [] });
    expect(r.success).toBe(false);
  });
});

describe("ClusterResponseSchema", () => {
  it("rejects more than 50 clusters", () => {
    const clusters = Array.from({ length: 51 }, () => ({
      topic: "T",
      headline: "h",
      importance: 5,
      articleIds: [validId],
    }));
    const r = ClusterResponseSchema.safeParse({ clusters });
    expect(r.success).toBe(false);
  });

  it("accepts empty clusters array", () => {
    const r = ClusterResponseSchema.safeParse({ clusters: [] });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/digest/cluster-types.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement cluster-types.ts**

Create `lib/digest/cluster-types.ts`:

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

export const clusterResponseJsonSchema = zodToJsonSchema(ClusterResponseSchema, {
  name: "ClusterResponse",
  target: "openApi3",
});
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm test tests/digest/cluster-types.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/digest/cluster-types.ts tests/digest/cluster-types.test.ts
git commit -m "feat(digest): Zod schemas + JSON schema for LLM cluster I/O"
```

---

## Task 9: lib/digest/llm-client.ts

**Files:**
- Create: `lib/digest/llm-client.ts`
- Create: `tests/digest/llm-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/digest/llm-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callChatCompletion,
  LlmTimeoutError,
  LlmRateLimitError,
  LlmHttpError,
  LlmParseError,
} from "@/lib/digest/llm-client";

const CONFIG = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
};

describe("callChatCompletion", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it("posts to baseUrl/chat/completions with auth + body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const out = await callChatCompletion(CONFIG, {
      system: "sys",
      user: "user",
      jsonSchema: { name: "X", schema: { type: "object" } },
    });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1]).toEqual({ role: "user", content: "user" });
    expect(body.response_format).toBeDefined();
  });

  it("throws LlmTimeoutError after 30 s", async () => {
    globalThis.fetch = vi.fn(
      () => new Promise(() => {}) // never resolves
    ) as unknown as typeof fetch;
    const p = callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } });
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(p).rejects.toBeInstanceOf(LlmTimeoutError);
  });

  it("throws LlmRateLimitError on 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("rate limited", { status: 429 })
    ) as unknown as typeof fetch;
    await expect(
      callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } })
    ).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("throws LlmHttpError on other non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("server error", { status: 500 })
    ) as unknown as typeof fetch;
    await expect(
      callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } })
    ).rejects.toBeInstanceOf(LlmHttpError);
  });

  it("throws LlmParseError on non-JSON content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;
    await expect(
      callChatCompletion(CONFIG, { system: "", user: "", jsonSchema: { name: "X", schema: {} } })
    ).rejects.toBeInstanceOf(LlmParseError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/digest/llm-client.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement llm-client.ts**

Create `lib/digest/llm-client.ts`:

```ts
const TIMEOUT_MS = 30_000;

export class LlmTimeoutError extends Error {
  constructor() {
    super(`LLM request exceeded ${TIMEOUT_MS}ms`);
    this.name = "LlmTimeoutError";
  }
}
export class LlmRateLimitError extends Error {
  constructor() {
    super("LLM rate limited (429)");
    this.name = "LlmRateLimitError";
  }
}
export class LlmHttpError extends Error {
  constructor(public status: number, body: string) {
    super(`LLM HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "LlmHttpError";
  }
}
export class LlmParseError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
    this.name = "LlmParseError";
  }
}

export interface LlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatCompletionInput {
  system: string;
  user: string;
  jsonSchema: { name: string; schema: unknown };
}

export async function callChatCompletion(
  config: LlmClientConfig,
  input: ChatCompletionInput
): Promise<unknown> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model: config.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: input.jsonSchema.name, schema: input.jsonSchema.schema, strict: false },
    },
    temperature: 0.2,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new LlmTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new LlmRateLimitError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmHttpError(res.status, text);
  }

  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = (await res.json()) as typeof json;
  } catch (e) {
    throw new LlmParseError("Response body is not JSON", "");
  }
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LlmParseError("Missing message.content", JSON.stringify(json));
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new LlmParseError("message.content is not valid JSON", content);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm test tests/digest/llm-client.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/digest/llm-client.ts tests/digest/llm-client.test.ts
git commit -m "feat(digest): OpenAI-compatible chat completion client with typed errors + 30s timeout"
```

---

## Task 10: lib/digest/cluster.ts

**Files:**
- Create: `lib/digest/cluster.ts`
- Create: `tests/digest/cluster.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/digest/cluster.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runClustering, SYSTEM_PROMPT } from "@/lib/digest/cluster";
import type { DedupedArticle } from "@/lib/digest/types";

function makeDeduped(n: number): DedupedArticle[] {
  return Array.from({ length: n }, (_, i) => ({
    primary: {
      id: `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`,
      title: `Title ${i}`,
      url: `https://e.com/${i}`,
      summary: `Summary ${i}`,
      feedTitle: "feed",
      publishedAt: new Date("2026-05-19T00:00:00Z"),
    },
    duplicates: [],
  }));
}

describe("SYSTEM_PROMPT", () => {
  it("contains the topic <= 8 and importance >= 8 <= 5 constraints", () => {
    expect(SYSTEM_PROMPT).toMatch(/<= 8/);
    expect(SYSTEM_PROMPT).toMatch(/importance >= 8/i);
    expect(SYSTEM_PROMPT).toMatch(/English/);
  });
});

describe("runClustering", () => {
  it("calls the client once for <= 150 articles", async () => {
    const deduped = makeDeduped(10);
    const client = vi.fn().mockResolvedValue({
      clusters: [
        {
          topic: "AI",
          headline: "Headline",
          importance: 8,
          articleIds: deduped.map((d) => d.primary.id),
        },
      ],
    });
    const out = await runClustering(deduped, client);
    expect(client).toHaveBeenCalledTimes(1);
    expect(out.clusters).toHaveLength(1);
  });

  it("batches when > 150 articles", async () => {
    const deduped = makeDeduped(310);
    const client = vi.fn().mockImplementation(async ({ user }: { user: string }) => {
      const ids = (user.match(/"id":"[^"]+"/g) ?? []).map((m) => m.slice(6, -1));
      return {
        clusters: [{ topic: "Misc", headline: "h", importance: 5, articleIds: ids }],
      };
    });
    const out = await runClustering(deduped, client);
    expect(client).toHaveBeenCalledTimes(3); // 150 + 150 + 10
    expect(out.clusters).toHaveLength(1); // merged by same topic
    expect(out.clusters[0].articleIds).toHaveLength(310);
  });

  it("filters unknown article ids from response", async () => {
    const deduped = makeDeduped(3);
    const ghost = "22222222-2222-2222-2222-222222222222";
    const client = vi.fn().mockResolvedValue({
      clusters: [
        {
          topic: "X",
          headline: "h",
          importance: 5,
          articleIds: [deduped[0].primary.id, ghost, deduped[1].primary.id],
        },
      ],
    });
    const out = await runClustering(deduped, client);
    expect(out.clusters[0].articleIds).toEqual([deduped[0].primary.id, deduped[1].primary.id]);
  });

  it("folds extra topics into 'Other' when topic count > 8", async () => {
    const deduped = makeDeduped(10);
    const client = vi.fn().mockResolvedValue({
      clusters: deduped.map((d, i) => ({
        topic: `Topic${i}`, // 10 distinct topics
        headline: `h${i}`,
        importance: 10 - i,
        articleIds: [d.primary.id],
      })),
    });
    const out = await runClustering(deduped, client);
    const topics = new Set(out.clusters.map((c) => c.topic));
    expect(topics.size).toBeLessThanOrEqual(8);
    expect(topics.has("Other")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/digest/cluster.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement cluster.ts**

Create `lib/digest/cluster.ts`:

```ts
import { ClusterResponseSchema, clusterResponseJsonSchema } from "./cluster-types";
import type { Cluster, ClusterResponse } from "./cluster-types";
import type { DedupedArticle } from "./types";
import type { ChatCompletionInput, LlmClientConfig } from "./llm-client";
import { callChatCompletion } from "./llm-client";

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
  const topicMaxImp = Array.from(byTopic.entries())
    .map(([t, cs]) => ({ t, maxImp: Math.max(...cs.map((c) => c.importance)) }))
    .sort((a, b) => b.maxImp - a.maxImp);
  const keep = new Set(topicMaxImp.slice(0, MAX_TOPICS).map((x) => x.t));
  const kept: Cluster[] = [];
  const other: Cluster[] = [];
  for (const c of clusters) {
    if (keep.has(c.topic)) kept.push(c);
    else other.push(c);
  }
  if (other.length === 0) return kept;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm test tests/digest/cluster.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/digest/cluster.ts tests/digest/cluster.test.ts
git commit -m "feat(digest): cluster pipeline with prompt assembly, batching, topic folding"
```

---

## Task 11: lib/digest/fallback.ts + lib/digest/organize.ts

**Files:**
- Create: `lib/digest/fallback.ts`
- Create: `lib/digest/organize.ts`
- Create: `tests/digest/fallback.test.ts`
- Create: `tests/digest/organize.test.ts`

- [ ] **Step 1: Write the failing test for fallback**

Create `tests/digest/fallback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFallback } from "@/lib/digest/fallback";
import type { DedupedArticle } from "@/lib/digest/types";

function art(id: string): DedupedArticle {
  return {
    primary: {
      id,
      title: `t-${id}`,
      url: `https://e.com/${id}`,
      summary: null,
      feedTitle: "f",
      publishedAt: new Date(),
    },
    duplicates: [],
  };
}

describe("buildFallback", () => {
  it("returns mode=fallback-no-config and ungrouped contains all articles", () => {
    const ids = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"];
    const out = buildFallback(ids.map(art), "no-config");
    expect(out.mode).toBe("fallback-no-config");
    expect(out.ungrouped.map((a) => a.id).sort()).toEqual(ids.sort());
    expect(out.topHeadlines).toEqual([]);
    expect(out.topicGroups).toEqual([]);
    expect(out.totalArticles).toBe(2);
  });

  it("supports llm-failed reason", () => {
    const out = buildFallback([art("11111111-1111-1111-1111-111111111111")], "llm-failed");
    expect(out.mode).toBe("fallback-llm-failed");
  });

  it("handles empty input", () => {
    const out = buildFallback([], "no-config");
    expect(out.ungrouped).toEqual([]);
    expect(out.totalArticles).toBe(0);
  });
});
```

- [ ] **Step 2: Write the failing test for organize**

Create `tests/digest/organize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { organize } from "@/lib/digest/organize";
import type { DedupedArticle } from "@/lib/digest/types";
import type { ClusterResponse } from "@/lib/digest/cluster-types";

const uuid = (n: number) => `${"1".repeat(8)}-${"1".repeat(4)}-${"1".repeat(4)}-${"1".repeat(4)}-${String(n).padStart(12, "0")}`;

function art(id: string): DedupedArticle {
  return {
    primary: { id, title: `T-${id.slice(-3)}`, url: `https://e.com/${id}`, summary: null, feedTitle: "f", publishedAt: new Date() },
    duplicates: [],
  };
}

describe("organize", () => {
  it("invariant: every input article appears exactly once in output (property test)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 6 }),
        (nArticles, nClusters) => {
          const deduped = Array.from({ length: nArticles }, (_, i) => art(uuid(i)));
          const ids = deduped.map((d) => d.primary.id);
          // Distribute ids across clusters
          const clusters = Array.from({ length: Math.min(nClusters, nArticles) }, (_, k) => ({
            topic: `T${k}`,
            headline: `h${k}`,
            importance: ((k * 3) % 10) + 1,
            articleIds: ids.filter((_, i) => i % nClusters === k % nClusters),
          })).filter((c) => c.articleIds.length > 0);
          const resp: ClusterResponse = { clusters };
          const out = organize(deduped, resp);
          const seen = new Set<string>();
          for (const h of out.topHeadlines) seen.add(h.primaryArticle.id);
          for (const g of out.topicGroups) {
            for (const c of g.clusters) {
              seen.add(c.primary.id);
              for (const d of c.duplicates) seen.add(d.id);
            }
          }
          for (const a of out.ungrouped) seen.add(a.id);
          expect(seen.size).toBe(nArticles);
          for (const id of ids) expect(seen.has(id)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Top headlines are fixed at 5 (padded by importance)", () => {
    const deduped = Array.from({ length: 7 }, (_, i) => art(uuid(i)));
    const resp: ClusterResponse = {
      clusters: deduped.map((d, i) => ({
        topic: "T",
        headline: `h${i}`,
        importance: 9 - i, // 9,8,7,6,5,4,3
        articleIds: [d.primary.id],
      })),
    };
    const out = organize(deduped, resp);
    expect(out.topHeadlines).toHaveLength(5);
    // Must be sorted by importance desc
    const imps = out.topHeadlines.map((h) => h.cluster.importance);
    expect(imps).toEqual([...imps].sort((a, b) => b - a));
  });

  it("returns fewer than 5 only if fewer clusters exist", () => {
    const deduped = [art(uuid(1)), art(uuid(2))];
    const resp: ClusterResponse = {
      clusters: [
        { topic: "A", headline: "h", importance: 9, articleIds: [uuid(1)] },
        { topic: "B", headline: "h", importance: 5, articleIds: [uuid(2)] },
      ],
    };
    const out = organize(deduped, resp);
    expect(out.topHeadlines).toHaveLength(2);
  });

  it("articles missing from clusters go to ungrouped", () => {
    const deduped = [art(uuid(1)), art(uuid(2)), art(uuid(3))];
    const resp: ClusterResponse = {
      clusters: [{ topic: "T", headline: "h", importance: 8, articleIds: [uuid(1)] }],
    };
    const out = organize(deduped, resp);
    expect(out.ungrouped.map((a) => a.id).sort()).toEqual([uuid(2), uuid(3)].sort());
  });

  it("mode = 'clustered' when clusters are provided", () => {
    const deduped = [art(uuid(1))];
    const out = organize(deduped, { clusters: [{ topic: "T", headline: "h", importance: 5, articleIds: [uuid(1)] }] });
    expect(out.mode).toBe("clustered");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:
```bash
pnpm test tests/digest/fallback.test.ts tests/digest/organize.test.ts
```

Expected: FAIL (modules not found).

- [ ] **Step 4: Implement fallback.ts**

Create `lib/digest/fallback.ts`:

```ts
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
```

- [ ] **Step 5: Implement organize.ts**

Create `lib/digest/organize.ts`:

```ts
import type { ClusterResponse, Cluster } from "./cluster-types";
import type { DedupedArticle, OrganizedDigest, TopHeadline, TopicGroup } from "./types";

const TOP_N = 5;

export function organize(
  deduped: DedupedArticle[],
  response: ClusterResponse
): OrganizedDigest {
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

  // Top headlines: top N by importance (allow any importance to pad)
  const sortedByImp = [...clustersWithArticles].sort(
    (a, b) => b.cluster.importance - a.cluster.importance
  );
  const topHeadlines: TopHeadline[] = sortedByImp.slice(0, TOP_N).map((cm) => {
    const totalSources = cm.members.reduce(
      (n, m) => n + 1 + m.duplicates.length,
      0
    );
    return {
      cluster: cm.cluster,
      primaryArticle: cm.members[0].primary,
      sourceCount: totalSources,
    };
  });

  // Group by topic
  const byTopic = new Map<string, typeof clustersWithArticles>();
  for (const cm of clustersWithArticles) {
    const arr = byTopic.get(cm.cluster.topic);
    if (arr) arr.push(cm);
    else byTopic.set(cm.cluster.topic, [cm]);
  }

  const topicGroups: TopicGroup[] = Array.from(byTopic.entries()).map(([topic, list]) => {
    const totalCount = list.reduce(
      (n, cm) => n + cm.members.reduce((m, x) => m + 1 + x.duplicates.length, 0),
      0
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

  // Ungrouped: any deduped item not referenced by any cluster
  const referenced = new Set<string>();
  for (const cm of clustersWithArticles) {
    for (const m of cm.members) referenced.add(m.primary.id);
  }
  const ungroupedItems = deduped.filter((d) => !referenced.has(d.primary.id));
  const ungrouped = ungroupedItems.flatMap((d) => [d.primary, ...d.duplicates]);

  const total =
    deduped.reduce((n, d) => n + 1 + d.duplicates.length, 0);

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
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
pnpm test tests/digest/fallback.test.ts tests/digest/organize.test.ts
```

Expected: all pass, including the 50-run property test.

- [ ] **Step 7: Commit**

```bash
git add lib/digest/fallback.ts lib/digest/organize.ts tests/digest/fallback.test.ts tests/digest/organize.test.ts
git commit -m "feat(digest): organize + fallback with property-tested no-article-loss invariant"
```

---

## Task 12: Email templates rewrite

**Files:**
- Create: `lib/email/templates/digest-html.ts`
- Create: `lib/email/templates/digest-fallback-html.ts`
- Create: `tests/email/templates/digest-html.test.ts`
- Create: `tests/email/templates/digest-fallback-html.test.ts`
- Modify: `lib/email/sender.ts`

- [ ] **Step 1: Write failing snapshot test for fallback template**

Create `tests/email/templates/digest-fallback-html.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import type { OrganizedDigest } from "@/lib/digest/types";

const fixture: OrganizedDigest = {
  date: new Date("2026-05-19T08:00:00Z"),
  totalArticles: 2,
  topicCount: 0,
  topHeadlines: [],
  topicGroups: [],
  ungrouped: [
    { id: "a", title: "Article A", url: "https://e.com/a", summary: "<p>Summary A</p>", feedTitle: "Feed A", publishedAt: new Date("2026-05-19T07:00:00Z") },
    { id: "b", title: "Article B", url: "https://e.com/b", summary: null, feedTitle: "Feed B", publishedAt: null },
  ],
  mode: "fallback-no-config",
};

describe("renderFallbackHtml", () => {
  it("renders all ungrouped articles, no banner when no-config", () => {
    const html = renderFallbackHtml(fixture);
    expect(html).toContain("Article A");
    expect(html).toContain("Article B");
    expect(html).toContain("https://e.com/a");
    expect(html).not.toContain("Topic clustering unavailable");
  });

  it("renders unavailable banner when llm-failed", () => {
    const html = renderFallbackHtml({ ...fixture, mode: "fallback-llm-failed" });
    expect(html).toContain("Topic clustering unavailable");
  });
});
```

- [ ] **Step 2: Implement digest-fallback-html.ts**

Create `lib/email/templates/digest-fallback-html.ts`:

```ts
import type { OrganizedDigest, DigestArticle } from "@/lib/digest/types";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderArticleBlock(a: DigestArticle): string {
  return `
    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
      <h3 style="margin: 0 0 8px 0;">
        <a href="${esc(a.url)}" style="color: #2563eb; text-decoration: none;">${esc(a.title)}</a>
      </h3>
      <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
        ${esc(a.feedTitle)} · ${esc(fmtDate(a.publishedAt))}
      </p>
      <details style="margin-top: 8px;">
        <summary style="cursor: pointer; color: #2563eb; font-size: 13px; font-weight: 500;">Click to expand details</summary>
        <div style="margin-top: 8px; color: #444; font-size: 14px; line-height: 1.6;">
          ${a.summary ?? '<p style="margin:0;color:#666;">No details available.</p>'}
        </div>
      </details>
    </div>`;
}

export function renderFallbackHtml(digest: OrganizedDigest): string {
  const banner = digest.mode === "fallback-llm-failed"
    ? `<p style="color:#94a3b8;font-size:12px;margin:0 0 12px 0;">Topic clustering unavailable for this digest.</p>`
    : "";
  const articles = digest.ungrouped.map(renderArticleBlock).join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;">
        <tr><td style="padding:20px 30px;background:#1e293b;color:#fff;">
          <h1 style="margin:0;font-size:24px;">Today's Feedwise Digest</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          ${banner}
          ${articles || '<p style="color:#666;">No articles today.</p>'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
```

- [ ] **Step 3: Run fallback template test**

Run:
```bash
pnpm test tests/email/templates/digest-fallback-html.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Write failing test for clustered template**

Create `tests/email/templates/digest-html.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import type { OrganizedDigest } from "@/lib/digest/types";

const fixture: OrganizedDigest = {
  date: new Date("2026-05-19T08:00:00Z"),
  totalArticles: 3,
  topicCount: 1,
  topHeadlines: [
    {
      cluster: { topic: "AI", headline: "OpenAI ships GPT-5", importance: 9, articleIds: ["a"] },
      primaryArticle: { id: "a", title: "OpenAI ships GPT-5", url: "https://e.com/a", summary: "<p>x</p>", feedTitle: "Verge", publishedAt: new Date() },
      sourceCount: 3,
    },
  ],
  topicGroups: [
    {
      topic: "AI",
      totalCount: 3,
      clusters: [
        {
          cluster: { topic: "AI", headline: "OpenAI ships GPT-5", importance: 9, articleIds: ["a", "b", "c"] },
          primary: { id: "a", title: "OpenAI ships GPT-5", url: "https://e.com/a", summary: "<p>main</p>", feedTitle: "Verge", publishedAt: new Date() },
          duplicates: [
            { id: "b", title: "OpenAI GPT-5 launch", url: "https://e.com/b", summary: null, feedTitle: "HN", publishedAt: null },
            { id: "c", title: "GPT-5 released today", url: "https://e.com/c", summary: null, feedTitle: "TechCrunch", publishedAt: null },
          ],
        },
      ],
    },
  ],
  ungrouped: [],
  mode: "clustered",
};

describe("renderDigestHtml", () => {
  it("renders Top Headlines section with star importance and source count", () => {
    const html = renderDigestHtml(fixture);
    expect(html).toMatch(/TOP HEADLINES/i);
    expect(html).toContain("OpenAI ships GPT-5");
    expect(html).toContain("3 sources");
    expect(html).toContain("9"); // importance star
  });

  it("renders topic groups with totalCount and folded sources", () => {
    const html = renderDigestHtml(fixture);
    expect(html).toMatch(/AI[^<]*\(3\)/);
    expect(html).toContain("OpenAI GPT-5 launch"); // folded duplicate visible in details
    expect(html).toContain("other source"); // collapsible label
  });

  it("renders Ungrouped section only when ungrouped is non-empty", () => {
    const html = renderDigestHtml(fixture);
    expect(html).not.toContain("Ungrouped");
    const withU = renderDigestHtml({
      ...fixture,
      ungrouped: [
        { id: "u", title: "Misc article", url: "https://e.com/u", summary: null, feedTitle: "F", publishedAt: null },
      ],
    });
    expect(withU).toContain("Ungrouped");
    expect(withU).toContain("Misc article");
  });
});
```

- [ ] **Step 5: Implement digest-html.ts**

Create `lib/email/templates/digest-html.ts`:

```ts
import type { OrganizedDigest, DigestArticle, TopicGroup, TopHeadline } from "@/lib/digest/types";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function topicAnchor(topic: string): string {
  return "topic-" + topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderHeadline(h: TopHeadline, i: number): string {
  const num = ["(1)", "(2)", "(3)", "(4)", "(5)"][i] ?? `(${i + 1})`;
  return `
    <div style="margin-bottom:10px;">
      <span style="color:#94a3b8;font-variant-numeric:tabular-nums;">${num}</span>
      <a href="#${topicAnchor(h.cluster.topic)}" style="color:#2563eb;text-decoration:none;font-weight:500;">${esc(h.cluster.headline)}</a>
      <span style="color:#94a3b8;font-size:12px;"> &middot; ${esc(h.cluster.topic)} &middot; ${h.sourceCount} sources &middot; ★ ${h.cluster.importance}</span>
    </div>`;
}

function renderClusterBlock(c: TopicGroup["clusters"][number]): string {
  const dup = c.duplicates.length;
  const dupBlock = dup > 0
    ? `<details style="margin-top:6px;"><summary style="cursor:pointer;color:#2563eb;font-size:12px;">+${dup} other source${dup === 1 ? "" : "s"}</summary>
        <ul style="margin:6px 0 0 16px;padding:0;color:#666;font-size:12px;">
          ${c.duplicates.map((d) => `<li><a href="${esc(d.url)}" style="color:#2563eb;text-decoration:none;">${esc(d.title)}</a> &middot; ${esc(d.feedTitle)}</li>`).join("")}
        </ul></details>`
    : "";
  return `
    <div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #eee;">
      <a href="${esc(c.primary.url)}" style="color:#111;text-decoration:none;font-weight:500;font-size:15px;">${esc(c.primary.title)}</a>
      <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${esc(c.primary.feedTitle)} &middot; ${esc(fmtDate(c.primary.publishedAt))}</div>
      ${c.primary.summary ? `<div style="color:#444;font-size:13px;line-height:1.55;margin-top:6px;">${c.primary.summary}</div>` : ""}
      ${dupBlock}
    </div>`;
}

function renderTopicGroup(g: TopicGroup): string {
  return `
    <div id="${topicAnchor(g.topic)}" style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${esc(g.topic)} <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${g.totalCount})</span></h2>
      ${g.clusters.map(renderClusterBlock).join("")}
    </div>`;
}

function renderUngrouped(items: DigestArticle[]): string {
  if (items.length === 0) return "";
  return `
    <div style="margin-top:28px;">
      <h2 style="margin:0 0 12px 0;font-size:16px;color:#111;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Ungrouped <span style="color:#94a3b8;font-size:12px;font-weight:normal;">(${items.length})</span></h2>
      ${items.map((a) => `
        <div style="margin-bottom:14px;">
          <a href="${esc(a.url)}" style="color:#111;text-decoration:none;font-weight:500;font-size:14px;">${esc(a.title)}</a>
          <div style="color:#94a3b8;font-size:12px;">${esc(a.feedTitle)} &middot; ${esc(fmtDate(a.publishedAt))}</div>
        </div>`).join("")}
    </div>`;
}

export function renderDigestHtml(digest: OrganizedDigest): string {
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
          <h2 style="margin:0 0 14px 0;font-size:13px;color:#94a3b8;letter-spacing:0.08em;">TOP HEADLINES</h2>
          ${digest.topHeadlines.map(renderHeadline).join("")}
          ${digest.topicGroups.map(renderTopicGroup).join("")}
          ${renderUngrouped(digest.ungrouped)}
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

- [ ] **Step 6: Run clustered template test**

Run:
```bash
pnpm test tests/email/templates/digest-html.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7: Refactor sender to accept html from caller**

Open `lib/email/sender.ts`. Replace the `sendDailyDigest` function so it no longer builds HTML — it accepts pre-rendered html and a subject. Replace the entire `sendDailyDigest` function (lines from `export async function sendDailyDigest` through its closing `}`) with:

```ts
export interface DailyDigestSend {
  to: string;
  subject: string;
  html: string;
  smtpConfig?: SMTPConfig | null;
}

export async function sendDailyDigest(email: DailyDigestSend): Promise<void> {
  const transporter = getEmailTransporter(email.smtpConfig);
  const smtpUser = email.smtpConfig?.user || process.env.SMTP_USER || "";
  const useStrictFrom = requiresStrictEnvelopeFrom(smtpUser);
  const from = useStrictFrom
    ? smtpUser
    : normalizeFromAddress(
        email.smtpConfig?.from || process.env.SMTP_FROM,
        smtpUser,
        "Feedwise <noreply@feedwise.app>"
      );

  await transporter.sendMail({
    from,
    ...(useStrictFrom && smtpUser.includes("@")
      ? { envelope: { from: smtpUser, to: email.to } }
      : {}),
    to: email.to,
    subject: email.subject,
    html: email.html,
  });
}
```

Also delete the now-unused helpers from `sender.ts`: `limitEmailImageSize`, `normalizeArticleDetailsHtml`, `formatDate`, and the `DailyDigestEmail` / `EmailArticle` interface usage check (keep `EmailArticle` export since `queries.ts` still uses it).

- [ ] **Step 8: Typecheck**

Run:
```bash
pnpm tsc --noEmit
```

Expected: no errors. If `digest-worker.ts` complains about old `sendDailyDigest` signature, that's expected — fixed in Task 13.

- [ ] **Step 9: Commit**

```bash
git add lib/email/templates/ lib/email/sender.ts tests/email/templates/
git commit -m "feat(email): split digest templates from sender; clustered + fallback renderers"
```

---

## Task 13: Wire pipeline into digest-worker.ts

**Files:**
- Modify: `lib/jobs/workers/digest-worker.ts`
- Create: `tests/jobs/digest-worker.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/jobs/digest-worker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assembleDigestForSubscription } from "@/lib/jobs/workers/digest-worker";
import type { DigestArticle } from "@/lib/digest/types";

vi.mock("@/lib/email/queries", () => ({
  getUserLlmConfig: vi.fn(),
}));
vi.mock("@/lib/digest/cluster", () => ({
  runClustering: vi.fn(),
}));

import { getUserLlmConfig } from "@/lib/email/queries";
import { runClustering } from "@/lib/digest/cluster";

function art(id: string): DigestArticle {
  return {
    id: `11111111-1111-1111-1111-${String(id).padStart(12, "0")}`,
    title: `T-${id}`,
    url: `https://e.com/${id}`,
    summary: null,
    feedTitle: "f",
    publishedAt: new Date(),
  };
}

describe("assembleDigestForSubscription", () => {
  beforeEach(() => {
    vi.mocked(getUserLlmConfig).mockReset();
    vi.mocked(runClustering).mockReset();
  });

  it("when LLM disabled, returns fallback (no-config) and never calls runClustering", async () => {
    vi.mocked(getUserLlmConfig).mockResolvedValue(null);
    const articles = [art("1"), art("2")];
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.mode).toBe("fallback-no-config");
    expect(runClustering).not.toHaveBeenCalled();
    // all article ids preserved for markArticlesAsSent
    expect(out.allArticleIds.sort()).toEqual(articles.map((a) => a.id).sort());
  });

  it("when LLM enabled and succeeds, returns clustered digest", async () => {
    vi.mocked(getUserLlmConfig).mockResolvedValue({
      enabled: true,
      baseUrl: "https://api.x",
      apiKey: "sk",
      model: "m",
    });
    const articles = [art("1"), art("2")];
    vi.mocked(runClustering).mockResolvedValue({
      clusters: [
        {
          topic: "AI",
          headline: "h",
          importance: 8,
          articleIds: articles.map((a) => a.id),
        },
      ],
    });
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.mode).toBe("clustered");
    expect(out.allArticleIds.sort()).toEqual(articles.map((a) => a.id).sort());
  });

  it("when LLM fails, returns fallback (llm-failed)", async () => {
    vi.mocked(getUserLlmConfig).mockResolvedValue({
      enabled: true,
      baseUrl: "https://api.x",
      apiKey: "sk",
      model: "m",
    });
    vi.mocked(runClustering).mockRejectedValue(new Error("boom"));
    const articles = [art("1")];
    const out = await assembleDigestForSubscription("user", articles);
    expect(out.digest.mode).toBe("fallback-llm-failed");
    expect(out.allArticleIds).toEqual([articles[0].id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/jobs/digest-worker.test.ts
```

Expected: FAIL — `assembleDigestForSubscription` not exported.

- [ ] **Step 3: Refactor digest-worker.ts**

Open `lib/jobs/workers/digest-worker.ts`. Add new imports at top:

```ts
import { dedupeByCanonicalUrl, dedupeByTitleSimilarity } from "@/lib/digest/dedupe";
import { runClustering } from "@/lib/digest/cluster";
import { organize } from "@/lib/digest/organize";
import { buildFallback } from "@/lib/digest/fallback";
import { callChatCompletion } from "@/lib/digest/llm-client";
import { renderDigestHtml } from "@/lib/email/templates/digest-html";
import { renderFallbackHtml } from "@/lib/email/templates/digest-fallback-html";
import type { DigestArticle, OrganizedDigest } from "@/lib/digest/types";
```

Also add `getUserLlmConfig` to the existing `@/lib/email/queries` import block at the top of the file (do not create a separate import line).
```

Add the new exported helper right above `sendDigestForDate`:

```ts
/**
 * Pure-ish assembly: dedupe + cluster (or fallback) + organize.
 * Returns the organized digest plus the ORIGINAL article ids to mark as sent.
 * Exported for unit testing.
 */
export async function assembleDigestForSubscription(
  userId: string,
  articles: DigestArticle[]
): Promise<{ digest: OrganizedDigest; allArticleIds: string[] }> {
  const allArticleIds = articles.map((a) => a.id);
  const llmConfig = await getUserLlmConfig(userId);

  const dedupedByUrl = dedupeByCanonicalUrl(articles);
  const deduped = dedupeByTitleSimilarity(dedupedByUrl, 0.85);

  if (!llmConfig) {
    return { digest: buildFallback(deduped, "no-config"), allArticleIds };
  }

  try {
    const client = (input: Parameters<typeof callChatCompletion>[1]) =>
      callChatCompletion(llmConfig, input);
    const response = await runClustering(deduped, client);
    return { digest: organize(deduped, response), allArticleIds };
  } catch (err) {
    console.error(`[digest] LLM clustering failed for user ${userId}:`, err);
    return { digest: buildFallback(deduped, "llm-failed"), allArticleIds };
  }
}
```

Now replace the body of `sendDigestForDate` so it calls `assembleDigestForSubscription` and renders:

```ts
async function sendDigestForDate(
  subscription: Awaited<ReturnType<typeof getAllActiveSubscriptions>>[0],
  triggerDate: Date,
  fromDate: Date | null
) {
  const email = await getUserEmail(subscription.userId);
  if (!email) {
    console.log(`[digest] No email for user ${subscription.userId}`);
    return;
  }

  const articles = await getArticlesForEmail(
    subscription.userId,
    fromDate ?? undefined,
    triggerDate
  );

  const { digest, allArticleIds } = await assembleDigestForSubscription(
    subscription.userId,
    articles
  );

  const smtpConfig =
    subscription.smtpHost && subscription.smtpUser && subscription.smtpPass
      ? {
          host: subscription.smtpHost,
          port: subscription.smtpPort || 587,
          user: subscription.smtpUser,
          pass: subscription.smtpPass,
          from: subscription.smtpFrom || "Feedwise <noreply@feedwise.app>",
        }
      : null;

  const dateStr = triggerDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const subject =
    articles.length === 0
      ? `Feedwise Digest - ${dateStr} - No new articles`
      : `Feedwise Digest - ${dateStr} - ${articles.length} article${articles.length === 1 ? "" : "s"}`;

  const html =
    digest.mode === "clustered" ? renderDigestHtml(digest) : renderFallbackHtml(digest);

  try {
    await sendDailyDigest({ to: email, subject, html, smtpConfig });
    await markArticlesAsSent(subscription.userId, allArticleIds);
    await logDigestSend(subscription.userId, articles.length, "success");
    console.log(
      `[digest] Sent digest to ${email} (${articles.length} articles, mode=${digest.mode}) for ${triggerDate.toDateString()}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logDigestSend(subscription.userId, articles.length, "failed", message);
    console.error(`[digest] Failed to send to ${email}:`, message);
    throw err;
  }
}
```

- [ ] **Step 4: Run worker test + typecheck**

Run:
```bash
pnpm test tests/jobs/digest-worker.test.ts
pnpm tsc --noEmit
```

Expected: 3 tests pass, no type errors.

- [ ] **Step 5: Run the full digest test suite**

Run:
```bash
pnpm test tests/crypto/ tests/digest/ tests/email/ tests/jobs/
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/jobs/workers/digest-worker.ts tests/jobs/digest-worker.test.ts
git commit -m "feat(digest): wire dedupe + cluster + organize pipeline into digest worker"
```

---

## Task 14: API routes for LLM config

**Files:**
- Create: `app/api/email/llm/config/route.ts`
- Create: `app/api/email/llm/test/route.ts`
- Create: `tests/api/llm-test.test.ts`

- [ ] **Step 1: Implement config save route**

Create `app/api/email/llm/config/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { updateUserLlmConfig } from "@/lib/email/queries";

const InputSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url().or(z.literal("")),
  apiKey: z.string().optional(), // undefined = keep existing
  model: z.string().max(100),
});

export async function PUT(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input", details: parsed.error.format() }, { status: 400 });
  }

  await updateUserLlmConfig(session.user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement test ping route**

Create `app/api/email/llm/test/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserLlmConfig } from "@/lib/email/queries";
import { callChatCompletion, LlmTimeoutError } from "@/lib/digest/llm-client";

const InputSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  let apiKey = parsed.data.apiKey;
  if (!apiKey) {
    const stored = await getUserLlmConfig(session.user.id);
    if (!stored || !stored.apiKey) {
      return NextResponse.json({ error: "no api key provided or stored" }, { status: 400 });
    }
    apiKey = stored.apiKey;
  }

  try {
    const reply = await callChatCompletion(
      { baseUrl: parsed.data.baseUrl, apiKey, model: parsed.data.model },
      {
        system: "You are a test ping. Reply with valid JSON only.",
        user: 'Reply with JSON {"ok": true}',
        jsonSchema: { name: "Ping", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } },
      }
    );
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    if (err instanceof LlmTimeoutError) {
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message.slice(0, 200) }, { status: 502 });
  }
}
```

- [ ] **Step 3: Manual smoke test the ping route**

Start the dev server (`pnpm dev:all`), log in, then in a browser dev console while logged in:

```js
fetch("/api/email/llm/test", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-...",
    model: "gpt-4o-mini",
  }),
}).then((r) => r.json()).then(console.log);
```

Expected: `{ ok: true, reply: { ok: true } }` (or a clearly-typed error if creds wrong).

- [ ] **Step 4: Commit**

```bash
git add app/api/email/llm
git commit -m "feat(api): LLM config save + test-ping endpoints"
```

---

## Task 15: Settings UI — Smart Digest card

**Files:**
- Modify: `app/(reader)/settings/page.tsx`

> **Heads up:** `settings/page.tsx` is ~33 KB. Read it first to understand the existing form / state patterns before adding the new card. Match existing patterns (React 19 `useActionState` + Server Action OR client fetch — whichever the rest of the file uses).

- [ ] **Step 1: Read the existing settings page**

Run:
```bash
wc -l /Users/ashark/Code/my-apps/apps/feedwise/app/\(reader\)/settings/page.tsx
```

Then read it in sections to identify: (a) the existing email subscription card, (b) the form submission pattern (form actions vs fetch), (c) where to insert the new card. Take notes.

- [ ] **Step 2: Add LLM config state and card**

Below the existing email subscription card, insert a new card. Pattern (adapt to match the file's actual conventions; this is the contract not the exact JSX):

```tsx
// 1. Add to component state (using existing pattern):
const [llmEnabled, setLlmEnabled] = useState(initialSettings.llmEnabled ?? false);
const [llmBaseUrl, setLlmBaseUrl] = useState(initialSettings.llmBaseUrl ?? "");
const [llmApiKey, setLlmApiKey] = useState(""); // empty = "keep existing"
const [llmModel, setLlmModel] = useState(initialSettings.llmModel ?? "");
const llmKeyMask = initialSettings.llmApiKey
  ? `${initialSettings.llmApiKey.slice(0, 4)}…${initialSettings.llmApiKey.slice(-4)}`
  : "";

// 2. Save handler:
async function saveLlmConfig() {
  const res = await fetch("/api/email/llm/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enabled: llmEnabled,
      baseUrl: llmBaseUrl,
      apiKey: llmApiKey || undefined, // undefined = keep existing
      model: llmModel,
    }),
  });
  if (!res.ok) toast.error("Failed to save LLM config");
  else toast.success("LLM config saved");
}

// 3. Test handler:
async function testLlm() {
  setLlmTesting(true);
  const res = await fetch("/api/email/llm/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: llmBaseUrl,
      apiKey: llmApiKey || undefined,
      model: llmModel,
    }),
  });
  setLlmTesting(false);
  if (res.ok) toast.success("LLM reachable");
  else toast.error(`Test failed (${res.status})`);
}

// 4. JSX card (place after existing email subscription card):
<section className="rounded-xl border border-border bg-card p-6 mt-4">
  <header className="mb-4">
    <h2 className="text-base font-semibold">Smart Digest (Beta)</h2>
    <p className="text-sm text-muted-foreground mt-1">
      When on, your digest is grouped by topic and ranked by importance.
      Uses your own OpenAI-compatible API. Off by default.
    </p>
  </header>
  <label className="flex items-center gap-2 mb-4">
    <input type="checkbox" checked={llmEnabled} onChange={(e) => setLlmEnabled(e.target.checked)} />
    <span>Enable LLM clustering</span>
  </label>
  <div className="grid gap-3">
    <label className="grid gap-1">
      <span className="text-sm">API Base URL</span>
      <input
        type="url"
        value={llmBaseUrl}
        onChange={(e) => setLlmBaseUrl(e.target.value)}
        placeholder="https://api.openai.com/v1"
        className="rounded border border-border bg-background px-2 py-1"
      />
    </label>
    <label className="grid gap-1">
      <span className="text-sm">API Key {llmKeyMask && <span className="text-muted-foreground">· stored: {llmKeyMask}</span>}</span>
      <input
        type="password"
        value={llmApiKey}
        onChange={(e) => setLlmApiKey(e.target.value)}
        placeholder={llmKeyMask ? "(unchanged — leave blank to keep)" : "sk-..."}
        className="rounded border border-border bg-background px-2 py-1"
      />
    </label>
    <label className="grid gap-1">
      <span className="text-sm">Model</span>
      <input
        type="text"
        value={llmModel}
        onChange={(e) => setLlmModel(e.target.value)}
        placeholder="gpt-4o-mini"
        className="rounded border border-border bg-background px-2 py-1"
      />
    </label>
  </div>
  <div className="mt-4 flex gap-2">
    <button onClick={saveLlmConfig} className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm">Save</button>
    <button onClick={testLlm} disabled={llmTesting} className="rounded border border-border px-3 py-1.5 text-sm">{llmTesting ? "Testing…" : "Test"}</button>
  </div>
</section>
```

- [ ] **Step 3: Ensure initialSettings exposes the new fields**

The page already loads `getSubscriptionSettings`. Extend that interface (if not already) so the new fields flow to the client. In `lib/email/queries.ts`, find `SubscriptionSettings` interface and add:

```ts
  llmEnabled?: boolean;
  llmBaseUrl?: string | null;
  llmApiKey?: string | null; // masked or empty for client
  llmModel?: string | null;
```

And in `getSubscriptionSettings`, include these in the return:

```ts
    llmEnabled: sub.llmEnabled ?? false,
    llmBaseUrl: sub.llmBaseUrl,
    llmApiKey: decryptIfEncrypted(sub.llmApiKey), // client masks for display
    llmModel: sub.llmModel,
```

- [ ] **Step 4: Manual smoke test the UI**

Run:
```bash
pnpm dev:all
```

In a browser:
1. Open `/settings`
2. Scroll to the new "Smart Digest (Beta)" card
3. Toggle enable on, paste baseUrl + apiKey + model, click Test → should toast "LLM reachable"
4. Click Save → should toast "LLM config saved"
5. Refresh page → API key field shows masked stored key

- [ ] **Step 5: Commit**

```bash
git add app/\(reader\)/settings/page.tsx lib/email/queries.ts
git commit -m "feat(ui): Smart Digest (Beta) settings card with Save + Test"
```

---

## Task 16: Manual smoke checklist (replaces Playwright E2E)

**Files:**
- Create: `docs/superpowers/manual-tests/2026-05-19-digest-llm-clustering.md`

- [ ] **Step 1: Write the checklist**

Create `docs/superpowers/manual-tests/2026-05-19-digest-llm-clustering.md`:

```markdown
# Manual smoke: Digest LLM Clustering

Run before merging. Requires a local Postgres + Redis + dev server (`pnpm dev:all`).

## Environment
- [ ] `ENCRYPTION_KEY` set in `.env` (32-byte base64). Without it, server refuses to boot.
- [ ] At least one feed subscribed; at least 5 articles in `articles` table from the past hour.

## Encryption at rest
- [ ] Run `pnpm db:encrypt-secrets` once. Output: `encrypted N`.
- [ ] Re-run: output `encrypted 0`.
- [ ] In psql: `SELECT smtp_pass FROM email_subscriptions WHERE smtp_pass IS NOT NULL LIMIT 1;` — should start with `v1:`.

## Settings UI
- [ ] `/settings` shows the "Smart Digest (Beta)" card.
- [ ] Toggle on, paste known-good OpenAI-compatible creds, click Test → success toast.
- [ ] Click Save → success toast.
- [ ] Refresh page → API key field shows masked value; toggle and model persisted.

## Digest send — clustered path
- [ ] In settings, set digest cron to `*/2 * * * *` (every 2 min).
- [ ] Watch worker logs. Within 2 min: `[digest] Sent digest to ... (N articles, mode=clustered)`.
- [ ] Inbox: email shows "TOP HEADLINES" section, topic groups, source-fold details.

## Digest send — fallback (no config) path
- [ ] In settings, disable LLM toggle, Save.
- [ ] Wait next cron trigger. Log: `mode=fallback-no-config`.
- [ ] Inbox: email matches the original style; no "Topic clustering unavailable" banner.

## Digest send — fallback (LLM failed) path
- [ ] In settings, enable LLM with a deliberately bad apiKey (e.g. "sk-invalid"). Save.
- [ ] Wait next cron trigger. Log: `[digest] LLM clustering failed ...` followed by `mode=fallback-llm-failed`.
- [ ] Inbox: email shows the "Topic clustering unavailable for this digest." banner.

## No-loss invariant (visual)
- [ ] Pick an article from `articles` table that's in the digest window.
- [ ] Confirm it appears in the email exactly once (TOP HEADLINES counts as one appearance shared with the topic group).

## Boot guard
- [ ] Temporarily unset `ENCRYPTION_KEY` in `.env`. Restart `pnpm worker`. Process exits with the env-var error.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/manual-tests/
git commit -m "docs: manual smoke checklist for digest LLM clustering"
```

---

## Task 17: Deployment docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add ENCRYPTION_KEY + migration to README**

Open `README.md`. After the "Setup" section's `pnpm db:push` line, insert:

```markdown

#### Encryption setup (required)

Generate a 32-byte base64 key for secret-at-rest encryption and add it to `.env`:

```bash
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))" >> .env
```

If you have existing data with plaintext SMTP/LLM secrets, run the one-time migration (safe to re-run):

```bash
pnpm db:encrypt-secrets
```

Both the web server and worker refuse to start if `ENCRYPTION_KEY` is missing or wrong length.
```

Also add the new script to the script table:

```markdown
| `pnpm db:encrypt-secrets` | One-time encrypt existing plaintext secrets (idempotent) |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: ENCRYPTION_KEY setup + encrypt-secrets migration in README"
```

---

## Self-Review

After all tasks complete:

- [ ] **Spec coverage** — every section of the spec maps to a task:
  - § 3 (Architecture): Tasks 1, 6-13
  - § 4 (Pipeline data flow): Task 13
  - § 5 (LLM schema + prompt): Tasks 8, 10
  - § 6 (Email template layout): Task 12
  - § 7 (Data model + UI): Tasks 3, 5, 14, 15
  - § 7 (Secret encryption): Tasks 1, 2, 4, 5
  - § 8 (Testing): tests within every task + Task 16 manual checklist
  - § 9 (Rollback): Schema nullable defaults + idempotent migration handled in Tasks 3, 4
  - § 10 (Gradual rollout): default-off `llmEnabled` from Task 3

- [ ] **All tests pass:** `pnpm test` green

- [ ] **Typecheck:** `pnpm tsc --noEmit` clean

- [ ] **Manual smoke:** every box in `docs/superpowers/manual-tests/2026-05-19-digest-llm-clustering.md` checked

---

**Plan complete and saved to** `docs/superpowers/plans/2026-05-19-digest-llm-clustering.md`.
