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
