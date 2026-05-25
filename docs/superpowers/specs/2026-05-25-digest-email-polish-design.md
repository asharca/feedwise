# Digest Email Polish + Clustering Accuracy — Design

**Date:** 2026-05-25
**Status:** Approved (brainstorm), pending implementation plan

## Summary

Make the daily digest email more refined and make its smart clustering accurate. Four cohesive changes:

1. **Clustering accuracy** (`lib/digest/`) — stop collapsing distinct events into one cluster per topic; preserve event-level clusters, grouped by topic.
2. **Email layout A** (`lib/email/`) — rebuild the template as "Top Stories + topic groups", each item showing **title + one-line brief only**. No images, no expand/collapse, click-through to read.
3. **Click-to-auto-save** (new endpoint + `lib/email/` + DB) — clicking an article link in the email can auto-star it. Opt-in toggle in settings.
4. **Settings page slimming** (`app/(reader)/settings/`) — left section-nav layout, each section extracted into its own component.

**Out of scope (explicitly dropped):** images in the email; curated/default global news sources; feed-discovery UX changes. Feed selection remains entirely the user's responsibility.

## Background / Current State

- `getArticlesForEmail` (`lib/email/queries.ts:180`) returns `EmailArticle` with `id, title, url, summary, feedTitle, publishedAt` — no image, no full content.
- Pipeline: dedupe (`lib/digest/dedupe.ts`) → cluster (`lib/digest/cluster.ts`) → organize (`lib/digest/organize.ts`) → template (`lib/email/templates/digest-html.ts`).
- `Cluster` = `{ topic, headline, importance, articleIds }` (`lib/digest/cluster-types.ts`). Intended model: **a cluster is one event; topic is a shared category label**.
- Star state lives in `userArticles (userId, articleId)` with `isStarred`; reusable writer `markArticle(userId, id, { isStarred })` (`lib/db/queries/articles.ts:109`); session-guarded PATCH at `app/api/articles/[id]/route.ts`.
- Base URL env: `NEXT_PUBLIC_APP_URL` (present in `.env`, also read in `lib/auth/index.ts:12`).

## 1. Clustering Accuracy (`lib/digest/`)

### Root cause
`mergeByTopic` (`cluster.ts:48`) groups clusters by topic string and flattens each topic into a **single** cluster with all `articleIds` combined. Downstream, `organize.ts` then has one cluster per topic, so every event after the first becomes a "duplicate source" of the primary and is hidden behind the `+N other sources` expander. This is both inaccurate (distinct events mislabeled as duplicates) and incompatible with layout A (which needs multiple title+brief items per topic).

`organize.ts` already supports many clusters per topic (`TopicGroup.clusters` is an array). The fix is in `cluster.ts`.

### Changes (all pure functions, unit-testable)
1. **Remove the topic-flattening `mergeByTopic`.** Replace cross-batch consolidation with **same-event merging only**: merge two clusters when their headline token-set Jaccard ≥ `EVENT_MERGE_THRESHOLD` (reuse the `jaccard`/`tokenize` approach from `dedupe.ts`). Distinct events stay as distinct clusters even under the same topic.
2. **Normalize topic labels** so `organize.ts` grouping is robust: canonicalize by trimmed, case-insensitive key; display label = first-seen casing. Events are never merged by this step — only their topic label is unified.
3. **Deduplicate article assignment**: each `articleId` belongs to exactly one cluster (the highest-`importance` cluster that claims it); strip it from others. Drop clusters left empty.
4. **`foldExtraTopics` becomes relabel-not-merge**: when distinct topics > `MAX_TOPICS` (8), keep the top `MAX_TOPICS - 1` topics by max importance and **relabel** overflow clusters' `topic` to `"Other"` — keeping them as separate event clusters rather than merging into one.
5. **Tighten `SYSTEM_PROMPT`**: state explicitly that **one cluster = one event/story**, and **topic is a category label shared across clusters**. Reduces over-merging at the source.
6. **Transient-failure retry**: wrap the per-batch LLM call (`clusterBatch` / `callChatCompletion`) with limited retries + exponential backoff on `LlmRateLimitError` and `LlmTimeoutError`, so a single hiccup doesn't degrade the whole digest to fallback.

### Pipeline order after change
`clusterBatch` per batch → concat → dedupe article assignment → merge same-event clusters (cross-batch) → normalize topics → fold extra topics (relabel) → `organize`.

## 2. Email Layout A (`lib/email/templates/digest-html.ts`)

Rebuild the HTML (table-based, inline styles, email-safe) as:

- **Header**: date · article count · topic count.
- **TOP STORIES**: top 5 from `topHeadlines`. Each = cluster headline linked to the primary article, plus meta `N sources · ★ importance`.
- **Topic groups**: per topic, render **each event cluster** as: title (primary article, linked) + **one-line brief** + meta `feedTitle · date`. **Remove the `+N other sources` `<details>` expander.** If a cluster has extra duplicate sources, show plain non-interactive text `· N sources`.
- **Ungrouped**: title + one-line brief + meta.
- **Brief**: derive plain text from `summary`, strip HTML, clamp (~140 chars). No full content.
- **No images anywhere.**

### Link construction
`renderDigestHtml` accepts an injected `buildLink(article: DigestArticle) => string`. The worker chooses the implementation based on the user's `autoSaveOnClick` setting (see §3). Default builder returns `article.url`.

## 3. Click-to-Auto-Save

Email clicks have no session, so use a signed-token redirect.

- **DB**: add `autoSaveOnClick boolean NOT NULL DEFAULT false` to `emailSubscriptions`. Generate + apply migration (`pnpm db:generate` / `pnpm db:migrate`). Surface it in `SubscriptionSettings`, `getSubscriptionSettings`, `updateSubscriptionSettings`, and the `/api/settings/email` route + PUT schema.
- **Token util** (`lib/email/click-token.ts`): `sign(userId, articleId)` → base64url payload + HMAC-SHA256, key derived from `ENCRYPTION_KEY`; `verify(token)` → `{ userId, articleId } | null`. No URL is stored in the token.
- **Redirect endpoint** `GET /api/r?t=<token>` (`app/api/r/route.ts`):
  1. `verify(token)`; on failure → 302 to `NEXT_PUBLIC_APP_URL` (no leak).
  2. Look up the article by `articleId`; if missing → 302 to app home.
  3. `markArticle(userId, articleId, { isStarred: true })` (reuse existing writer). On DB error, swallow and continue — never block reading.
  4. 302 redirect to the article's real `url` from the DB (never a URL from the token → no open redirect).
- **Worker** (`lib/jobs/workers/digest-worker.ts`): read `autoSaveOnClick`; build `buildLink` = on → `${NEXT_PUBLIC_APP_URL}/api/r?t=${sign(userId, article.id)}`, off → `article.url`. Pass into `renderDigestHtml`.
- **Settings UI**: toggle "Auto-save articles when clicked in email" in the Digest Email section, persisted via `/api/settings/email` PUT. Default off (opt-in).

## 4. Settings Page Slimming (`app/(reader)/settings/`)

Refactor `settings/page.tsx` (~540 lines) into a left section-nav + right pane layout. Extract each section into a focused component under `components/settings/`:

- `appearance-section.tsx` — theme.
- `feeds-section.tsx` — sync / OPML import-export / subscription list + intervals + delete.
- `digest-email-section.tsx` — enable, schedule (CronBuilder), SMTP, feed selection, test send, **+ auto-save toggle**.
- `smart-digest-section.tsx` — LLM config.
- `account-section.tsx` — profile.

`page.tsx` becomes a thin shell: active-section state + data loading passed down. Sections list (left rail desktop): General/Appearance · Feeds · Digest Email · Smart Digest · Account. Mobile: nav collapses to a top select/tabs. Preserve all existing behavior and API calls; this is a structural refactor, not a behavior change (except the new toggle).

## Error Handling

- Invalid/missing token → safe redirect to app home; never reveal validity details.
- Auto-save DB write failure → log server-side, still redirect to the article.
- Clustering retry exhausted → existing fallback (`buildFallback`).
- Email brief: null/empty summary renders title-only cleanly.

## Testing

- **Clustering (unit)**: same-event merge across batches; distinct events under one topic stay separate; article-assignment dedup; topic-label normalization; `foldExtraTopics` relabels overflow (no flatten). Fixtures simulate >150-article batches and same-topic-different-events.
- **organize (unit)**: a topic with multiple event clusters yields multiple `TopicGroup.clusters` entries (regression guard for the root-cause bug).
- **click-token (unit)**: sign/verify round-trip; tampered payload/signature rejected.
- **`/api/r` (integration)**: valid token stars + redirects to DB url; invalid token safe-redirects; unknown article handled; DB failure still redirects.
- **email template (fixture)**: layout A renders multiple items per topic, contains no `<details>`/expander markup, and every link uses the injected `buildLink`.
- **Verification gates**: `pnpm build`, `pnpm test`, migration generate/apply.

## Open Implementation Notes

- Confirm `NEXT_PUBLIC_APP_URL` is set in the worker's runtime env (Docker compose already passes app env; verify worker service).
- `EVENT_MERGE_THRESHOLD`, brief clamp length, and retry counts are tunable constants — start conservative (e.g., Jaccard 0.6, 140 chars, 2 retries).
