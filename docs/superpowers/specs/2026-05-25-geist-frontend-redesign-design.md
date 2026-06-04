# Geist Frontend Redesign — Design Spec

**Date:** 2026-05-25
**Status:** Approved (design), pending implementation plan
**Scope:** Visual + IA redesign of the entire web frontend (auth, reader, dashboard, discover, settings). No backend / API / digest-pipeline changes.

## Goal

Redesign the whole web UI from the current warm-paper "Reeder" style to a **Vercel / Geist** aesthetic: neutral grayscale + a single blue accent, high contrast, restrained ~6px radius, generous whitespace, flat surfaces. Restructure the reader to a conventional 3-column layout and rework Settings into a compact-row + sub-tab form that eliminates long vertical scrolling. Unify all interface copy to English.

This is a styling/IA effort. Business logic, data flow, state management, API routes, and the digest pipeline are preserved unchanged. The "no AI in the web UI" rule (see `2026-05-19-digest-llm-clustering-design.md`) is unaffected.

## Decisions (locked)

| Decision           | Choice                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| Design direction   | Vercel / Geist — black/white, high contrast, sharp, whitespace           |
| Accent color       | Single blue, Vercel-style (~`#0070f3`), accent-only usage                |
| Font               | Geist Sans + Geist Mono via the `geist` npm package + `next/font`        |
| Default theme      | Dark (both themes rebuilt as Geist high-contrast)                        |
| Interface copy     | Unified to English                                                       |
| Reader layout      | Conventional 3-column: sidebar \| article list (left) \| reader (right)  |
| Corner radius      | Restrained ~6px (`--radius: 0.375rem`); sweep hardcoded `rounded-xl/2xl` |
| Settings form      | Compact rows + sub-tabs (no long scroll)                                 |
| Execution approach | Token-first + targeted per-surface sweep (incremental, low risk)         |

## Execution approach

**Token-first + targeted sweep.** Most primitives already read CSS variables from `globals.css`, so the bulk of the shift is at the token layer; the rest is a per-surface sweep to remove hardcoded warm/rounded/lift classes and apply Geist spacing, finishing with the structural changes (reader 3-column, settings sub-tabs).

Rejected alternatives:

- _Ground-up component rebuild_ — replace Base UI / shadcn primitives wholesale. Highest fidelity but huge effort and discards working integration. Overkill.
- _Variables-only retheme_ — only edit `globals.css`. Won't deliver: hardcoded `rounded-xl`/`glass`/lift classes and the old layout remain.

## 1. Design tokens (`app/globals.css`)

The heart of the redesign. Rewrite the `:root` (light) and `.dark` token blocks.

**Color — drop the warm hue, go neutral grayscale + one blue.** Today's palette carries a warm tint (chroma at hue 60–80/260). Geist is pure neutral gray plus a single blue.

Dark theme (default):

- `--background: oklch(0.12 0 0)` (near-black, neutral)
- `--card / --popover: oklch(0.165 0 0)` (elevated surface)
- `--foreground: oklch(0.97 0 0)`
- `--muted: oklch(0.22 0 0)`, `--muted-foreground: oklch(0.65 0 0)`
- `--secondary / --accent: oklch(0.22 0 0)`
- `--border: oklch(1 0 0 / 10%)`, `--input: oklch(1 0 0 / 14%)`
- `--primary: oklch(0.62 0.19 252)` (Vercel blue), `--primary-foreground: oklch(0.98 0 0)`
- `--ring: var(--primary)`
- `--sidebar: oklch(0.10 0 0)` (slightly darker than content), sidebar tokens follow suit
- `--destructive` stays red

Light theme:

- `--background: oklch(1 0 0)` (white)
- `--foreground: oklch(0.18 0 0)`
- `--card / --popover: oklch(1 0 0)`
- `--muted / --secondary / --accent: oklch(0.97 0 0)`, `--muted-foreground: oklch(0.45 0 0)`
- `--border / --input: oklch(0.92 0 0)`
- `--primary: oklch(0.58 0.20 252)`, `--primary-foreground: oklch(0.98 0 0)`
- `--sidebar: oklch(0.985 0 0)`

**Accent usage rule (enforced during sweep):** blue appears ONLY on — primary buttons, links, active nav/tab indicator, unread dots, focus ring, search/selection highlight, switches in the "on" state. Everything else neutral. Star icon stays yellow; destructive stays red.

**Radius:** `--radius: 0.375rem` (6px). The existing multiplier scale stays, so `lg≈6 / xl≈8 / 2xl≈10px` — restrained even where `rounded-2xl` survives. The sweep still lowers the most prominent offenders (logo blocks, dialogs, large cards) toward `rounded-md`/`rounded-lg`.

**Surfaces:** flatter. Replace box shadows and `hover:-translate-y-*` lifts with 1px borders + subtle bg/border hover transitions. Remove (or neutralize) the `.glass` blur utility. Keep `.scrollbar-thin`.

**`article-content` typography:** retune link color to the new blue, `text-decoration-color` neutral; blockquote border neutral; keep spacing. Keep code/pre using Geist Mono.

**`.scroll-progress`:** uses `var(--primary)` (already does) — inherits new blue.

## 2. Fonts (`app/layout.tsx` + `globals.css`)

- Add the `geist` package (currently not installed).
- In `layout.tsx`, import `GeistSans` from `geist/font/sans` and `GeistMono` from `geist/font/mono`; apply `GeistSans.variable GeistMono.variable` to `<html>`.
- In `globals.css` `@theme inline`, set `--font-sans: var(--font-geist-sans)` and `--font-geist-mono: var(--font-geist-mono)`. This also fixes the currently-undefined `--font-sans`.
- Keep `defaultTheme="dark"`, `enableSystem`, `disableTransitionOnChange`, `suppressHydrationWarning`.
- Headings shift `font-bold → font-semibold` with `tracking-tight` (sweep where set).

Must not introduce Next.js font warnings or hydration errors (uses `next/font`, which is the supported path).

## 3. Shared UI primitives (`components/ui/`)

Reskin via tokens + small edits; most inherit automatically.

- **`button.tsx`** — variants tuned for Geist: `default` solid blue; `outline` 1px border on neutral bg; `ghost` subtle neutral hover; `secondary` neutral; `destructive` unchanged semantics. Keep existing sizes/API.
- **`input.tsx`** — clean 1px border, blue focus ring, neutral bg.
- **`card.tsx`** — flat: prefer `border` over the `ring-1 ring-foreground/10`; smaller radius; remove `font-heading` reliance if undefined.
- **Sweep** `rounded-2xl`/`rounded-xl` → `rounded-md`/`rounded-lg` and remove shadows/lift in: `dialog`, `dropdown-menu`, `sheet`, `tabs`, `badge`, `sidebar`, `command`, `tooltip`, `separator`, `scroll-area`, `skeleton`, `sonner`.
- **New primitives** (added under `components/ui/`): `switch.tsx` (replaces hand-rolled inline toggles used 3× in settings), `segmented.tsx` (segmented control).

## 4. Reader restructure (3-column)

**`app/(reader)/reader/page.tsx`** rebuilt to: **sidebar \| article list (left, ~320px fixed) \| reader (right, flex-1)**.

- List always renders on the left; the reader fills the right with a centered ~680px measure and a "Select an article" empty state.
- The **"Today's News" magazine dashboard** (`news-dashboard.tsx`) remains the full-bleed landing for the `view=all` home (no feed/folder/search). Selecting any article routes it into the right reader pane; the list appears alongside.
- All existing handlers and optimistic-update logic preserved verbatim: `handleSelect`, `handleStar`, `handleMarkRead`, `handleMarkAllRead`, `handleLoadMore`, the `feedwise:unread-delta` / `feedwise:mark-all-read` custom events, pagination, `useTransition`.
- Mobile: single-column with list ↔ reader navigation (list shown by default; opening an article shows the reader with a back affordance), preserving current `SidebarTrigger` behavior.

**`components/article/article-list.tsx`** — left-list rows are the primary mode: flat rows, sharp radius, neutral meta, blue unread dot, no hover lift. Keep the magazine grid variant for the dashboard's use only.

**`components/article/article-reader.tsx`** — flat action bar (no rounded-xl buttons), Geist editorial typography, accent scroll-progress. Logic (scroll progress save, sanitize, image proxy, copy link) unchanged.

**`components/layout/app-sidebar.tsx`** — neutral + sharp; active item gets a blue indicator (left bar or subtle bg); feed/view pill rows `rounded-xl → rounded-md`; flatter logo block; Geist search field. All feed CRUD dialogs/handlers unchanged.

## 5. Dashboard / Discover / Auth

- **`components/dashboard/news-dashboard.tsx`** — keep hero / normal / compact hierarchy; flatten (border not shadow, sharp radius, neutral, remove hover lift).
- **`app/(reader)/discover/page.tsx`** — flatter route cards, neutral/blue namespace rail + chips, Geist search.
- **`app/(auth)/login/page.tsx`, `register/page.tsx`** — Geist centered layout; flatten the `rounded-2xl shadow-lg` logo block; sharpen inputs/buttons; keep auth logic/redirect handling.

## 6. Settings redesign (`app/(reader)/settings/`)

**Form: compact rows + sub-tabs.** Keep the `/settings` route and the left section rail (Appearance · Feeds · Digest · Smart · Account). Replace tall stacked forms with row-based settings.

**New reusable settings primitives:**

- `SettingRow` — title + description on the left, control slot on the right, hairline divider.
- `SettingsSubTabs` — sub-tab bar within a section.
- (uses `Switch` and `Segmented` from §3)

**Per section:**

- **Appearance** — one "Theme" row → `Segmented` (Light/Dark/System).
- **Feeds** — action row (Sync / Import / Export, right-aligned); subscription list where each row is icon+title/url left, interval `Segmented`/select + delete right. List scrolls **internally** (max-height), not the page.
- **Digest Email** — split into **sub-tabs** (each short, no long scroll):
  - _General_ — Enable digest (Switch row) · Auto-save on click (Switch row)
  - _Schedule_ — CronBuilder, compacted into rows
  - _SMTP_ — host / port / from / user / password rows · Send Test button
  - _Feeds_ — feed-selection checklist (internal scroll) + "N selected / all" hint

  Sub-tabs (Schedule/SMTP/Feeds) appear only when the digest is enabled; General always shown.

- **Smart Digest** — Enable LLM (Switch row) · Base URL / API Key / Model rows · Save + Test.
- **Account** — identity row (avatar + name + email + joined) · Display Name row (input + Save) · Email row (input + Save).

All settings save handlers, validation (`isSMTPConfigValid`, host/port checks), and load logic in `settings/page.tsx` are preserved; only presentation changes. The mobile section `<select>` is kept (or upgraded to the same rail pattern).

## 7. Copy unification → English

Sweep all Chinese interface strings to English. Known targets (audit for any others during implementation):

- `app-sidebar.tsx`: `搜索文章…` → `Search articles…`; `全部已读` / `全部标为已读` → `Mark all read`; toast `全部标为已读` → `Marked all as read`.
- `article-list.tsx`: `加载中…` → `Loading…`; `加载更多` → `Load more`.
- `reader/page.tsx`: toast `全部已读` → `Marked all as read`.
- `article-reader.tsx`: toast `链接已复制` → `Link copied`.
- `settings/page.tsx`: toast `测试邮件发送成功` → `Test email sent`.
- `digest-email-section.tsx`: `推送计划` → `Schedule`; `选择何时推送邮件摘要` → `When to send the digest`; `保存中…` → `Saving…`; `保存推送计划` → `Save schedule`; `取消` → `Cancel`; `点击文章时自动收藏` → `Auto-save on click`; `在邮件中点开文章后自动加入收藏夹` → `Save to starred when opened from email`.
- `cron-builder.tsx`: weekday labels `周一…周日` → `Mon…Sun`; presets `每天/每周/每月/自定义` → `Daily/Weekly/Monthly/Custom`; `时`/`分` → `Hour`/`Minute`; `日期`/`N号` → `Day`/`Nth`; `Cron 表达式` label + `无效的 Cron 表达式` → `Invalid cron expression`; format hint + `describeCron` output (`每天/每周/工作日/每月N号` …) → English equivalents.

`describeCron` and `formatTimeList` are pure functions — their English output is unit-testable.

## Testing

Restyle changes are mostly token/class edits with low logic risk. Verification:

- `pnpm build` passes (types + production build); no new Next.js or hydration warnings.
- `pnpm test` (Vitest) stays green — no logic changes to existing modules.
- **New/updated tests:**
  - `cron-builder` English output: unit-test `describeCron` / `formatTimeList` produce the new English strings for daily/weekly/weekday/monthly cases.
  - Reader 3-column: a render/interaction test asserting list-left/reader-right structure and that selecting a list item populates the reader pane (jsdom).
  - `Switch` / `Segmented` primitives: basic interaction tests (toggle calls `onChange`; segmented selection updates active item).

## Out of scope

- Backend, API routes, DB schema, digest pipeline, auth/OAuth logic.
- New product features. This is visual + IA only.
- RTL / additional locales (copy is unified to English, not externalized to an i18n framework).

## Follow-ups

- After implementation, update the `ui_style` memory (currently records "Reeder-style") to describe the Geist system (neutral grayscale + blue accent, ~6px radius, Geist font, 3-column reader, compact-row settings).
