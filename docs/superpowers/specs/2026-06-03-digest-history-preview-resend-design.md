# Digest History Preview & Resend — Design

**Date:** 2026-06-03
**Status:** Approved (brainstorm), pending implementation plan

## Summary

The digest history list (`components/settings/digest-history-section.tsx`) already records the last 30 sends via `email_digest_logs`, but it only shows a status icon and timestamp. Add two actions to each row:

1. **Preview** — render the exact articles that were in that past send.
2. **Resend** — re-send that same article set to the user's email.

Both work for any log row, success or failed. Resends create a new log row (the original is preserved verbatim for audit).

## Background / Current State

- `email_digest_logs` (`lib/db/schema.ts:294`) records `id, userId, sentAt, articleCount, status, errorMessage`. No link to the article IDs that were in the send.
- `getDigestHistory(userId, limit=30)` (`lib/email/queries.ts:366`) returns the last 30 rows.
- The Daily Digest settings card has its own "Preview email" action (`/api/email/llm/preview`) that renders _what the next digest would look like_ using the current article pool, plus a "Send Test Email" action that uses the current pool and current SMTP config.
- The digest render pipeline is `assembleDigestForSubscription` + `renderDigestHtml` (LLM path) or `buildFallback` + `renderFallbackHtml` (no-config path). The same primitives can be re-driven with a different input article set.
- Click links in digest emails are wrapped by `buildEmailLinkFn` so opens hit `/api/r?…` first; this enables the `markReadOnClick` / `autoSaveOnClick` settings. Per brainstorming decision, resends honor the user's _current_ click-behavior settings (no snapshotting).
- SMTP error messages are currently mapped inline in `app/api/settings/email/test/route.ts:79-90` for ENETUNREACH, EAUTH, ETIMEDOUT, and QQ mail's strict-envelope rule. The resend route needs the same mapping.

## 1. New Table: `email_digest_log_articles`

Captures the exact article set of every send so we can preview and resend past digests.

```ts
email_digest_log_articles {
  logId:     uuid  FK → email_digest_logs.id  ON DELETE CASCADE
  articleId: uuid  FK → articles.id           ON DELETE CASCADE
  PRIMARY KEY (logId, articleId)
}
```

Indexes:

- Composite PK on `(logId, articleId)` — supports "all articles in a log" lookups.
- `articles.id` FK index — implicit; no extra index needed since we never query by articleId alone.

Migration: Drizzle file under `drizzle/` adding the table with both FKs and the composite PK. Idempotent: drop+recreate is fine because the table is empty in production until this ships.

## 2. Library Changes (`lib/email/`)

### `lib/email/queries.ts`

**New function** `getArticlesForLog(logId: string, userId: string): Promise<EmailArticle[]>`:

- Joins `email_digest_log_articles` → `articles` (with the `userArticles` enrichment `getArticlesForEmail` already does — tags, feedTitle, AI summary, importance).
- Scoped to `userId` defensively: the join includes `email_digest_logs.userId = userId` so an attacker who guesses another user's `logId` gets an empty result.
- Returns `[]` if the log doesn't exist, is owned by someone else, or has no recorded articles (covers the empty-digest case).
- Same return type as `getArticlesForEmail`, so the digest pipeline accepts it as a drop-in.

**New function** `logDigestSendWithArticles(userId, articleIds, articleCount, status, errorMessage?)`:

- Wraps two inserts in `db.transaction`:
  1. Insert into `email_digest_logs` (same shape as `logDigestSend`).
  2. Bulk insert into `email_digest_log_articles` (`.onConflictDoNothing()` so a re-run is safe).
- Returns the new `logId` so the worker can correlate. (The existing worker code doesn't need the id, but exposing it keeps the function useful for tests and for any future per-log linking.)

**Modified** `logDigestSend` — kept as a thin wrapper that calls `logDigestSendWithArticles` with an empty `articleIds` array. Existing call sites that don't know the article IDs (none today) keep working. The new path replaces the worker call site so all future sends record the article set.

**Modified** worker call site (`lib/jobs/workers/digest-worker.ts`):

- In the success path of `sendDigestForDate` (L154-160), replace `logDigestSend(...)` with `logDigestSendWithArticles(subscription.userId, allArticleIds, articles.length, "success")`. `allArticleIds` is already in scope (returned by `assembleDigestForSubscription`).
- In the failure path (L161-166), replace `logDigestSend(..., message)` with `logDigestSendWithArticles(subscription.userId, allArticleIds, articles.length, "failed", message)`.
- The worker's article array is already filtered to the [fromDate, toDate] window, so the recorded set is exactly the set that was attempted.
- The worker's `sendDailyDigestWithRetry` is currently a file-local helper (L172). To make it reusable from the resend route, **export it from the worker file** with a single `export` keyword. The resend route imports it directly. Alternative: extract to `lib/email/sender.ts` — pick the smaller diff (export from worker) for v1.

### `lib/email/smtp-error.ts` (new)

Single source of truth for SMTP error message mapping. Exports:

```ts
mapSmtpError(err: unknown): string
```

Returns the same human-readable strings the test-digest route already produces (ENETUNREACH, EAUTH, ETIMEDOUT, QQ strict-envelope, generic fallback with the raw error message). Both `app/api/settings/email/test/route.ts` and the new resend route use it. Pure function — no I/O — easy to unit test.

## 3. API Routes

### `GET /api/settings/email/history/[logId]/preview`

- Auth: `requireSession()` → 401 on failure.
- Validate `logId` (uuid parse) → 400 on invalid format.
- Load the log via `getDigestLogById(logId, userId)`; 404 if missing or not owned by this user. (An empty digest is a real log row — it returns 200 with `articleCount: 0`, distinct from "no such log".)
- Load the article set with `getArticlesForLog(logId, userId)`.
- Run `assembleDigestForSubscription(userId, articles)`. This returns `digest.mode` ("clustered" when articles had tags; "fallback" otherwise) — same primitive the worker uses.
- Dispatch render on `digest.mode`:
  - `"clustered"` → `renderDigestHtml(digest, buildEmailLinkFn(...))`
  - `"fallback"` (or anything else) → `renderFallbackHtml(digest, buildEmailLinkFn(...))`
  - This matches what the user actually received on that send, so preview is faithful.
- Return `{ success: true, data: { html, articleCount, sentAt, status, mode } }`.
- 500 with generic message on render failure (logged with `logId` and `digest.mode`).

### `POST /api/settings/email/history/[logId]/resend`

- Auth: `requireSession()` → 401.
- Load log via `getDigestLogById(logId, userId)`; 404 if missing/wrong-owner.
- `getArticlesForLog(logId, userId)`; if length 0 → 400 `{ error: "Nothing to resend — the original digest had no articles" }`.
- Load SMTP config (`getUserSMTPConfig(userId)`); 400 with `"SMTP not configured. Please configure your SMTP settings in the email settings."` if missing — same string the test route uses.
- Load click settings; build the link fn via `buildEmailLinkFn(userId, appUrl, { markReadOnClick, autoSaveOnClick })`. `appUrl = process.env.NEXT_PUBLIC_APP_URL || reqOrigin` (same fallback the test route uses, so the link is testable without the env set).
- Run `assembleDigestForSubscription(userId, articles)` and render via the same `digest.mode` dispatch as the preview route, so the resend is a faithful re-issue of the original layout.
- Subject: `📰 Your Feedwise Digest - Resent - {N} articles`.
- Call `sendDailyDigestWithRetry(...)` (the worker's retry helper — **must be reused** so resend has the same 3-attempt-with-backoff behavior as scheduled sends, otherwise resend would be less reliable than the original).
- `try { sendDailyDigestWithRetry(...) } finally { logDigestSendWithArticles(userId, articleIds, count, "success" | "failed", errMsg) }`. The `finally` guarantees the audit row is written even on retry-exhaustion.
- 200 `{ success: true, data: { sentTo, articleCount, newLogId } }`.
- 500 with `mapSmtpError(err)` on retry-exhaustion (the failed log row was still written, so history is consistent).

### Library helper for the route

**New** `getDigestLogById(logId, userId)` in `lib/email/queries.ts` — returns `{ id, sentAt, articleCount, status, errorMessage } | null`. Used by both new routes for the ownership check. Pure select; no transaction.

## 4. UI Changes

### `components/settings/digest-history-section.tsx`

- New per-row state: `pending: 'preview' | 'resend' | null`. While set, both buttons on that row are disabled and the active button shows a small spinner.
- Row layout (success or failed):

  ```
  [icon] [N articles · 2h ago · Jun 3, 8:00 AM]   [Eye] [Send]
  ```

  - `Eye` icon (`lucide-react`): Preview.
  - `Send` icon (`lucide-react`): Resend.
  - `size-7` ghost icon-buttons; `gap-1` between them; `shrink-0` so the timestamp flexes.
  - Failed rows keep the existing chevron + error expand affordance; the new icons sit to the right.
  - Resend disabled with tooltip `"Nothing to resend"` when the row's `articleCount === 0`.

- Preview: opens `EmailPreviewDialog` (see below) with `logId`.
- Resend: `POST` to the resend route. On success → `toast.success("Digest resent to {email}")` + refetch the history list. On error → `toast.error(mapSmtpError(err))` from a client-side copy of the same mapping (or just display `err` as-is — the server already returns the mapped string).
- Mobile: same inline layout; icons just use `size-6`.

### `components/settings/email-preview-dialog.tsx` (new)

Extracted from the existing `<Dialog>` block in `digest-email-section.tsx:372-409`. Props:

```ts
{ open: boolean; onOpenChange: (v: boolean) => void; logId: string | null }
```

- When `open && logId`: `fetch /api/settings/email/history/${logId}/preview` and render the returned `html` in `<iframe srcDoc sandbox="" />`.
- Header: `Email preview · {N} articles · {sentAt}` (uses the response's `sentAt` and `articleCount`).
- Loading state and empty state reuse the existing markup.
- `digest-email-section.tsx`'s "Preview email" button is refactored to use this component with a `null` logId, which keeps the existing behavior unchanged (the original `/api/email/llm/preview` route is still hit from there). Alternatively: leave the existing inline dialog alone and duplicate the iframe widget. The extraction is a polish choice — pick the smaller diff if pressed for time.

## 5. Error Handling

| Case                                     | Behavior                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No session                               | 401 `{ success: false, error: "Unauthorized" }` (both routes)                                                                                                                                                         |
| Invalid `logId` uuid                     | 400 `{ error: "Invalid log id" }`                                                                                                                                                                                     |
| Log not found / wrong owner              | 404 `{ error: "Not found" }`                                                                                                                                                                                          |
| Resend with 0 articles                   | 400 `{ error: "Nothing to resend — the original digest had no articles" }`; UI also disables the button                                                                                                               |
| SMTP not configured                      | 400 `{ error: "SMTP not configured. Please configure your SMTP settings in the email settings." }`                                                                                                                    |
| SMTP send error (after retry exhaustion) | 500 with `mapSmtpError(err)`; `logDigestSendWithArticles` still runs in `finally` with `status: "failed"` and the captured error message. Retries are inside `sendDailyDigestWithRetry` and not surfaced to the user. |
| DB error on read                         | 500 generic; logged with `logId`                                                                                                                                                                                      |
| Render pipeline error                    | 500 generic; logged with `logId` and pipeline stage                                                                                                                                                                   |
| Resend during resend (double-click)      | Client `pending` state disables the button; server has no dedupe so two parallel requests produce two log rows — acceptable per "no rate limit" decision                                                              |

All routes follow the project's `{ success, data?, error? }` envelope.

## 6. Testing

### Unit (vitest, per project test setup)

- `lib/email/queries.ts`:
  - `getArticlesForLog` — happy path returns joined articles; user mismatch returns `[]`; missing log returns `[]`.
  - `logDigestSendWithArticles` — transaction commits both inserts; rolls back when one insert throws (mock db to throw on the second insert); `.onConflictDoNothing` allows re-runs.
  - `getDigestLogById` — returns row scoped to user; null on missing.
- `lib/email/smtp-error.ts`:
  - `mapSmtpError` — ENETUNREACH, EAUTH, ETIMEDOUT, QQ strict-envelope substring, generic fallback.

### Integration / route (vitest with stub db + stub SMTP)

- `GET /api/settings/email/history/[logId]/preview`:
  - 401 without session.
  - 404 for log owned by another user.
  - 200 with rendered HTML for owned log (stub `assembleDigestForSubscription` and `renderDigestHtml` to return predictable strings).
  - 200 with `articleCount: 0` empty-state HTML for empty digest.
- `POST /api/settings/email/history/[logId]/resend`:
  - 401 without session.
  - 400 for empty article set.
  - 400 when SMTP not configured.
  - 200 + new success log row on happy path.
  - 500 with mapped message + new failed log row on SMTP error.

### UI

- Manual smoke checklist (no new test infra required):
  - Open settings → Daily Digest history. Three buttons appear on each row.
  - Click Preview on a success row → dialog opens with the rendered email and a header timestamp.
  - Click Resend on a failed row → toast "Digest resent" appears, new log row shows at top of list, original failed row unchanged.
  - Click Resend on a row with 0 articles → button is disabled.
  - Resend on a row triggers two clicks quickly → second click does nothing (button disabled while pending).

## 7. Out of Scope (Explicitly Dropped)

- No pagination on history list (limit stays 30).
- No "resend all failed" bulk action.
- No rate limit on resend (per brainstorm decision).
- No diff view between "what was sent then" and "what would be sent now."
- No subject-line customization on resend.
- No snapshotting `markReadOnClick` / `autoSaveOnClick` — resends honor current settings.
- No `parentLogId` linking resend rows to the original log they came from (history list shows the resend as a fresh row, naturally ordered by `sentAt`).
- No deletion of old log rows (out of scope; existing retention is "all-time").

## 8. Module Boundary Check (per AGENTS.md)

| New code                                                             | Module                                                             | Allowed dependencies   | Notes                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------- | ------------------------------- |
| `email_digest_log_articles` table                                    | `lib/db/schema.ts`                                                 | drizzle-orm, pg        | Pure schema                     |
| `getArticlesForLog`, `getDigestLogById`, `logDigestSendWithArticles` | `lib/email/queries.ts`                                             | `lib/db/*`             | Follows existing pattern        |
| `mapSmtpError`                                                       | `lib/email/smtp-error.ts` (new)                                    | none                   | Pure function                   |
| Two routes                                                           | `app/api/settings/email/history/[logId]/{preview,resend}/route.ts` | `lib/*`                | Thin wrappers                   |
| `EmailPreviewDialog`                                                 | `components/settings/`                                             | `lib/hooks` only       | Same as siblings                |
| `digest-history-section.tsx`                                         | `components/settings/`                                             | existing               | Surgical edit                   |
| Worker call site update                                              | `lib/jobs/workers/digest-worker.ts`                                | `lib/email/queries.ts` | One-line change to log function |

No cross-module boundary violations.
