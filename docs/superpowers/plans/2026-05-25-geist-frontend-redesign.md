# Geist Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the entire feedwise web frontend from the warm "Reeder" style to a Vercel/Geist aesthetic (neutral grayscale + single blue accent, ~6px radius, flat surfaces, Geist font), restructure the reader to a 3-column layout, rework Settings into compact rows + sub-tabs, and unify all copy to English.

**Architecture:** Token-first. Rewrite the CSS-variable layer in `globals.css` so most primitives inherit the new look, then sweep each surface to remove hardcoded warm/rounded/lift classes, then apply the two structural changes (reader 3-column, settings sub-tabs). No backend/API/digest changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Base UI (`@base-ui/react`) shadcn components, `next-themes`, `geist` font, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-25-geist-frontend-redesign-design.md`

---

## Conventions for this plan

- **Per-task quick check:** `npx tsc --noEmit` (fast type check). Run after edits.
- **Phase-boundary check:** `pnpm build` (full Next build; slower).
- **Logic tests:** `pnpm test` (Vitest, pure functions only — `tests/**/*.test.ts`, node env).
- **Visual verification:** the project has no component-test framework and follows a pure-function-test convention; visual/structural tasks are verified by `tsc` + `pnpm build` + the per-task **Visual checklist**. Do not add testing-library/jsdom.
- **Accent rule (apply everywhere):** blue (`--primary`) only on primary buttons, links, active nav/tab indicators, unread dots, focus rings, selection/search highlight, and switches in the "on" state. Everything else neutral. Star stays yellow; destructive stays red.
- **Radius rule:** replace `rounded-2xl`→`rounded-lg`, `rounded-xl`→`rounded-md` on controls/cards during sweeps; keep `rounded-full` (dots/avatars/pills-as-badges) and `rounded-sm` as-is.
- **No new Next.js warnings / hydration errors.** Keep existing `eslint-disable @next/next/no-img-element` lines.
- **Commits:** conventional commits; do NOT add Co-Authored-By (attribution disabled globally).

---

## Phase 0 — Foundation (tokens + font)

### Task 1: Add Geist font + wire it up

**Files:**
- Modify: `package.json` (add `geist` dependency)
- Modify: `app/layout.tsx`
- Modify: `app/globals.css:7-12` (the `@theme inline` font lines)

- [ ] **Step 1: Install the geist package**

Run: `pnpm add geist`
Expected: `geist` added to `package.json` dependencies.

- [ ] **Step 2: Wire fonts in `app/layout.tsx`**

Replace the file contents with:

```tsx
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feedwise",
  description: "Self-hosted RSS reader",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Point the font tokens at Geist in `app/globals.css`**

In the `@theme inline` block, change these two lines:

```css
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
```

to:

```css
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
```

(Leave `--font-heading: var(--font-sans);` as-is — it now resolves to Geist Sans.)

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Visual checklist**

Run `pnpm dev`, open `/login`. Confirm text renders in Geist Sans (geometric, even), no console font/hydration warnings.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml app/layout.tsx app/globals.css
git commit -m "feat(ui): add Geist Sans/Mono fonts"
```

---

### Task 2: Rewrite color + radius tokens, flatten utilities

**Files:**
- Modify: `app/globals.css:51-120` (the `:root` and `.dark` blocks)
- Modify: `app/globals.css:42-48` (radius scale base, via `--radius` in the theme blocks)
- Modify: `app/globals.css:134-156` (utilities — flatten `.glass`)
- Modify: `app/globals.css:158-219` (`.article-content` link/blockquote retune)

- [ ] **Step 1: Replace the light `:root` block**

Replace the entire `:root { ... }` block (currently lines ~52–85) with:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.18 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.18 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.18 0 0);
  --primary: oklch(0.58 0.20 252);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.25 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.45 0 0);
  --accent: oklch(0.96 0 0);
  --accent-foreground: oklch(0.25 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0 0);
  --input: oklch(0.92 0 0);
  --ring: oklch(0.58 0.20 252);
  --chart-1: oklch(0.58 0.20 252);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.375rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.18 0 0);
  --sidebar-primary: oklch(0.58 0.20 252);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-accent: oklch(0.95 0 0);
  --sidebar-accent-foreground: oklch(0.25 0 0);
  --sidebar-border: oklch(0.92 0 0);
  --sidebar-ring: oklch(0.58 0.20 252);
}
```

- [ ] **Step 2: Replace the dark `.dark` block**

Replace the entire `.dark { ... }` block (currently lines ~88–120) with:

```css
.dark {
  --background: oklch(0.12 0 0);
  --foreground: oklch(0.97 0 0);
  --card: oklch(0.165 0 0);
  --card-foreground: oklch(0.97 0 0);
  --popover: oklch(0.165 0 0);
  --popover-foreground: oklch(0.97 0 0);
  --primary: oklch(0.62 0.19 252);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.22 0 0);
  --secondary-foreground: oklch(0.97 0 0);
  --muted: oklch(0.22 0 0);
  --muted-foreground: oklch(0.65 0 0);
  --accent: oklch(0.24 0 0);
  --accent-foreground: oklch(0.97 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.62 0.19 252);
  --chart-1: oklch(0.62 0.19 252);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.10 0 0);
  --sidebar-foreground: oklch(0.97 0 0);
  --sidebar-primary: oklch(0.62 0.19 252);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-accent: oklch(0.20 0 0);
  --sidebar-accent-foreground: oklch(0.97 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.62 0.19 252);
}
```

- [ ] **Step 3: Flatten the `.glass` utility**

In the `@layer utilities` block, replace:

```css
  .glass {
    backdrop-filter: blur(24px) saturate(1.8);
  }
```

with:

```css
  .glass {
    background: color-mix(in oklch, var(--background) 80%, transparent);
    backdrop-filter: blur(8px);
  }
```

(Keep `.scrollbar-thin` and its children unchanged.)

- [ ] **Step 4: Retune `.article-content` link + blockquote colors**

In `.article-content a`, change `text-decoration-color: oklch(0.5 0 0 / 30%);` to `text-decoration-color: var(--border);` (leave the `:hover` rule using `var(--primary)`). Leave the rest of `.article-content` unchanged.

- [ ] **Step 5: Type check + build**

Run: `npx tsc --noEmit && pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Visual checklist**

`pnpm dev` → `/reader`. Confirm: dark near-black neutral background (no warm tint), white text, blue primary on the logo/active items, ~6px corners feel tighter. Toggle light theme in the sidebar — white bg, near-black text.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "feat(ui): rebuild color + radius tokens for Geist, flatten glass"
```

---

## Phase 1 — Shared primitives

> Phase boundary check at the end of Phase 1: `pnpm build`.

### Task 3: Reskin button, input, card

**Files:**
- Modify: `components/ui/button.tsx:13-22` (variants)
- Modify: `components/ui/card.tsx:15` (Card root classes)

- [ ] **Step 1: Tune button variants**

In `components/ui/button.tsx`, the base `cva` string already uses `rounded-lg` (now 6px) — leave it. In the `variants.variant` object, replace the `outline` and `ghost` entries with:

```ts
        outline:
          "border-border bg-background hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent dark:bg-transparent dark:hover:bg-accent",
        ghost:
          "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent dark:hover:bg-accent",
```

(Leave `default`, `secondary`, `destructive`, `link` as-is — they read from tokens.)

- [ ] **Step 2: Flatten Card**

In `components/ui/card.tsx`, in the `Card` function's `cn(...)`, replace `ring-1 ring-foreground/10` with `border border-border`. Leave the rest.

- [ ] **Step 3: Input — no change needed**

`components/ui/input.tsx` already reads `border-input`, `rounded-lg`, `focus-visible:ring-ring`. Leave as-is (inherits new tokens). No edit.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx components/ui/card.tsx
git commit -m "feat(ui): flatten button/card for Geist"
```

---

### Task 4: Sweep radius/shadow across remaining primitives

**Files (modify each):** `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/sheet.tsx`, `components/ui/tabs.tsx`, `components/ui/badge.tsx`, `components/ui/command.tsx`, `components/ui/tooltip.tsx`, `components/ui/scroll-area.tsx`, `components/ui/skeleton.tsx`, `components/ui/separator.tsx`, `components/ui/sidebar.tsx`

- [ ] **Step 1: Apply the radius rule in each file**

In each file above, find and replace class tokens:
- `rounded-2xl` → `rounded-lg`
- `rounded-xl` → `rounded-md`
- Remove any `shadow-lg` / `shadow-xl` (keep `shadow-sm` where used for menu/popover elevation).

Use grep to find them first:

Run: `grep -rn "rounded-2xl\|rounded-xl\|shadow-lg\|shadow-xl" components/ui/`

Edit each match per the rule. Leave `rounded-full`, `rounded-sm`, `rounded-md`, `rounded-lg` untouched.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify no stragglers**

Run: `grep -rn "rounded-2xl\|rounded-xl" components/ui/`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/ui/
git commit -m "refactor(ui): sweep radius/shadow to Geist scale in primitives"
```

---

### Task 5: Create `Switch` primitive

**Files:**
- Create: `components/ui/switch.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

function Switch({ checked, onCheckedChange, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      data-slot="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input"
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export { Switch };
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/switch.tsx
git commit -m "feat(ui): add Switch primitive"
```

---

### Task 6: Create `Segmented` primitive

**Files:**
- Create: `components/ui/segmented.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      data-slot="segmented"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-sm font-medium transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented };
export type { SegmentedOption };
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Phase boundary build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/ui/segmented.tsx
git commit -m "feat(ui): add Segmented control primitive"
```

---

## Phase 2 — Reader experience

### Task 7: Reskin app-sidebar + English copy

**Files:**
- Modify: `components/layout/app-sidebar.tsx`

- [ ] **Step 1: English copy**

Replace these strings:
- `placeholder="搜索文章..."` → `placeholder="Search articles…"`
- `全部已读` (the dropdown item label, line ~390) → `Mark all read`
- `toast.success("全部标为已读")` → `toast.success("Marked all as read")`

- [ ] **Step 2: Logo block — flatten/sharpen**

Replace the logo wrapper (line ~425):
```tsx
          <div className="size-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
```
with:
```tsx
          <div className="size-7 rounded-md bg-primary flex items-center justify-center shrink-0">
```

- [ ] **Step 3: Active indicator on feed/view rows**

For the smart-view and feed `SidebarMenuButton`s, replace `rounded-xl` with `rounded-md` (3 occurrences around lines 360, 461, 478, 570). The active state styling is driven by `isActive` (token-based) — no extra change needed.

- [ ] **Step 4: Search field — Geist style**

Replace the search `<input className=...>` (line ~437):
```tsx
            className="w-full text-sm bg-muted rounded-xl pl-8 pr-7 py-1.5 outline-none placeholder:text-muted-foreground/60"
```
with:
```tsx
            className="w-full text-sm bg-muted rounded-md pl-8 pr-7 py-1.5 outline-none border border-transparent focus:border-border placeholder:text-muted-foreground/60"
```

- [ ] **Step 5: Dialogs + footer buttons radius**

Replace remaining `rounded-2xl`→`rounded-lg` and `rounded-xl`→`rounded-md` in this file (the Dialog `DialogContent`s, Textarea, Inputs, footer Buttons). Verify:

Run: `grep -n "rounded-2xl\|rounded-xl" components/layout/app-sidebar.tsx`
Expected: no output.

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Visual checklist**

`/reader`: sidebar is neutral; active view/feed shows blue-tinted bg; unread count pills blue; search field sharp. Add-feed/rename/edit-url dialogs sharp.

- [ ] **Step 8: Commit**

```bash
git add components/layout/app-sidebar.tsx
git commit -m "feat(reader): Geist sidebar + English copy"
```

---

### Task 8: Reskin article-list + English copy

**Files:**
- Modify: `components/article/article-list.tsx`

- [ ] **Step 1: English copy**

In `LoadMoreButton`: `加载中...` → `Loading…`, `加载更多` → `Load more`.

- [ ] **Step 2: Flatten grid cards (magazine variant, used by dashboard)**

Replace the grid card wrapper className block (lines ~131-139):
```tsx
                "group relative flex flex-col rounded-xl overflow-hidden border bg-card",
                "cursor-pointer transition-all duration-150",
                "hover:shadow-md hover:border-border/80 hover:-translate-y-0.5",
                activeId === article.id
                  ? "border-primary/40 ring-1 ring-primary/30 shadow-sm"
                  : "border-border/50",
```
with:
```tsx
                "group relative flex flex-col rounded-md overflow-hidden border bg-card",
                "cursor-pointer transition-colors duration-150",
                "hover:border-foreground/20",
                activeId === article.id
                  ? "border-primary"
                  : "border-border",
```

- [ ] **Step 3: Compact list rows (left-list mode)**

In the `compact` branch, the row already uses `rounded-lg` and accent bg — leave radius. Confirm unread dot uses `bg-primary` (it does). No change.

- [ ] **Step 4: LoadMore button radius**

Replace `rounded-lg bg-muted` button — leave as-is (already 6px). No change beyond Step 1.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Visual checklist**

Open a feed view: compact rows show blue unread dot, neutral hover, no lift. Dashboard cards (later) flat with blue active border.

- [ ] **Step 7: Commit**

```bash
git add components/article/article-list.tsx
git commit -m "feat(reader): flatten article cards + English copy"
```

---

### Task 9: Reskin article-reader + English copy

**Files:**
- Modify: `components/article/article-reader.tsx`

- [ ] **Step 1: English copy**

`toast.success("链接已复制")` → `toast.success("Link copied")`.

- [ ] **Step 2: Action buttons radius**

In `ActionButton`, replace `rounded-xl` → `rounded-md`. In the `<a>` "Open original" link, replace `rounded-xl` → `rounded-md`.

- [ ] **Step 3: Empty-state icon block**

Replace `size-16 rounded-2xl bg-muted/50` → `size-14 rounded-lg bg-muted` (the "Select an article to read" block).

- [ ] **Step 4: Title weight**

The `<h1 className="text-2xl sm:text-3xl font-bold ...">` → change `font-bold` to `font-semibold`.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Visual checklist**

Open an article: flat action bar with sharp buttons; title is semibold; scroll-progress bar is blue; links in body are blue.

- [ ] **Step 7: Commit**

```bash
git add components/article/article-reader.tsx
git commit -m "feat(reader): Geist article reader + English copy"
```

---

### Task 10: Flatten news-dashboard

**Files:**
- Modify: `components/dashboard/news-dashboard.tsx`

- [ ] **Step 1: Hero card**

Replace hero wrapper classes (lines ~53-57):
```tsx
          "group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg",
          "bg-card border border-border/50",
          article.isRead && "opacity-70"
```
with:
```tsx
          "group relative rounded-lg overflow-hidden cursor-pointer transition-colors duration-150 hover:border-foreground/20",
          "bg-card border border-border",
          article.isRead && "opacity-70"
```

- [ ] **Step 2: Normal card**

Replace normal-card wrapper classes (lines ~155-158):
```tsx
        "group rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md",
        "bg-card border border-border/50",
        article.isRead && "opacity-65"
```
with:
```tsx
        "group rounded-md overflow-hidden cursor-pointer transition-colors duration-150 hover:border-foreground/20",
        "bg-card border border-border",
        article.isRead && "opacity-65"
```

- [ ] **Step 3: Compact card + empty-state**

Compact card uses `rounded-xl` (line ~112) → `rounded-md`. Empty-state icon block `size-16 rounded-2xl bg-muted/50` → `size-14 rounded-lg bg-muted`. Heading `text-lg font-bold` (hero h3) → `text-lg font-semibold`; `text-xl font-bold` page title → `text-xl font-semibold`.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/news-dashboard.tsx
git commit -m "feat(reader): flatten Today's News dashboard"
```

---

### Task 11: Restructure reader to 3-column + English copy

**Files:**
- Modify: `app/(reader)/reader/page.tsx`

This changes layout only. All handlers, state, fetch logic, and custom events are preserved verbatim — only the returned JSX for the list-view branch changes from "reader-left / list-right-rail" to "list-left / reader-right".

- [ ] **Step 1: English copy**

`toast.success("全部已读")` → `toast.success("Marked all as read")`.

- [ ] **Step 2: Replace the list-view return JSX**

Replace the entire final `return ( ... )` of `ReaderContent` (the block starting `return (` after `const mappedArticles = ...`, currently lines ~218-274) with:

```tsx
  return (
    <div className="flex h-full">
      {/* Article list panel — left */}
      <div className={cn(
        "flex flex-col border-r border-border bg-background shrink-0",
        activeArticle ? "w-80 hidden md:flex" : "w-full md:w-80"
      )}>
        <div className="px-3 h-11 flex items-center gap-2 shrink-0 border-b border-border">
          <SidebarTrigger className="md:hidden" />
          <h2 className="text-sm font-semibold tracking-tight truncate">{viewTitle}</h2>
          <div className="ml-auto flex items-center gap-1">
            {isPending && (
              <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            )}
            {articleList.some((a) => !a.isRead) && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                title="Mark all read"
                className="size-7 inline-flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ArticleList
            articles={mappedArticles}
            activeId={activeArticle?.id}
            onSelect={handleSelect}
            onStar={handleStar}
            compact
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            searchQuery={search}
          />
        </div>
      </div>

      {/* Reader panel — right */}
      <div className={cn(
        "flex-1 min-w-0 overflow-hidden",
        !activeArticle && "hidden md:block"
      )}>
        {activeArticle ? (
          <ArticleReader
            article={{ ...activeArticle, publishedAt: activeArticle.publishedAt ? new Date(activeArticle.publishedAt) : null }}
            onMarkRead={handleMarkRead}
            onStar={handleStar}
            onBack={() => setActiveArticle(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="size-14 rounded-lg bg-muted flex items-center justify-center">
              <BookOpen className="size-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm">Select an article to read</p>
          </div>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 3: Add the `BookOpen` import**

In the lucide import at the top (currently `import { CheckCheck } from "lucide-react";`), change to:
```tsx
import { CheckCheck, BookOpen } from "lucide-react";
```

- [ ] **Step 4: Force compact list mode always**

Note `ArticleList` is now always `compact` (left rail). The non-compact grid is used only by the dashboard. This is intentional — no further change.

- [ ] **Step 5: Type check + build**

Run: `npx tsc --noEmit && pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Visual checklist**

`/reader?view=unread`: list on the LEFT (~320px), reader on the RIGHT with "Select an article to read" empty state. Click an item → it opens on the right, list stays left. On mobile (narrow), opening shows the reader full-width with back arrow. The `/reader` home still shows the magazine dashboard.

- [ ] **Step 7: Commit**

```bash
git add "app/(reader)/reader/page.tsx"
git commit -m "feat(reader): conventional 3-column layout (list left, reader right)"
```

---

## Phase 3 — Discover + Auth

### Task 12: Reskin discover page

**Files:**
- Modify: `app/(reader)/discover/page.tsx`

- [ ] **Step 1: Route cards radius**

`RouteCard` wrapper `rounded-xl` → `rounded-md` (line ~97). Inner expand area, URL preview `rounded-lg` stay.

- [ ] **Step 2: Subscribe pill + mobile chips accent**

The inline subscribe button uses `bg-primary/10 text-primary` (line ~126) — keep (accent-correct). Mobile namespace chips active uses `bg-primary text-primary-foreground` — keep. No change.

- [ ] **Step 3: Namespace rail active state**

Active rail item uses `bg-accent font-medium` (lines ~286, 297) — token-correct, keep. No change. Confirm no `rounded-xl`/`rounded-2xl` remain:

Run: `grep -n "rounded-2xl\|rounded-xl" "app/(reader)/discover/page.tsx"`
Expected: no output.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(reader)/discover/page.tsx"
git commit -m "feat(discover): Geist radius pass"
```

---

### Task 13: Reskin login + register

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/register/page.tsx`

- [ ] **Step 1: login — flatten logo + sharpen controls**

In `app/(auth)/login/page.tsx`:
- Logo block `size-12 rounded-2xl bg-primary ... shadow-lg` → `size-11 rounded-lg bg-primary flex items-center justify-center` (drop `shadow-lg`).
- Heading `text-xl font-bold` → `text-xl font-semibold`.
- All `Input className="rounded-xl h-10"` → `className="rounded-md h-10"`.
- Submit `Button className="w-full rounded-xl h-10"` → `className="w-full rounded-md h-10"`.

- [ ] **Step 2: register — same treatment**

In `app/(auth)/register/page.tsx` apply the identical changes: logo `rounded-2xl ... shadow-lg` → `rounded-lg` (no shadow), heading `font-bold`→`font-semibold`, every `Input`/`Button` `rounded-xl` → `rounded-md`.

- [ ] **Step 3: Verify**

Run: `grep -rn "rounded-2xl\|rounded-xl\|shadow-lg" "app/(auth)/"`
Expected: no output.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/"
git commit -m "feat(auth): Geist login/register"
```

---

## Phase 4 — Cron logic extraction + i18n (tested)

### Task 14: Extract + test cron describe, then i18n cron-builder

**Files:**
- Create: `lib/cron/describe.ts`
- Create: `tests/cron/describe.test.ts`
- Modify: `components/cron-builder.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/cron/describe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeCron, formatTimeList } from "@/lib/cron/describe";

describe("formatTimeList", () => {
  it("zero-pads a single time", () => {
    expect(formatTimeList("8", "0")).toBe("08:00");
  });
  it("joins multiple hours with comma", () => {
    expect(formatTimeList("8,18", "0")).toBe("08:00, 18:00");
  });
});

describe("describeCron", () => {
  it("daily", () => {
    expect(describeCron("0 8 * * *")).toBe("Every day at 08:00");
  });
  it("weekly single day", () => {
    expect(describeCron("30 9 * * 1")).toBe("Every Monday at 09:00");
  });
  it("weekdays", () => {
    expect(describeCron("0 8 * * 1-5")).toBe("Weekdays at 08:00");
  });
  it("multiple weekdays", () => {
    expect(describeCron("0 8 * * 1,3,5")).toBe(
      "Every Monday, Wednesday, Friday at 08:00"
    );
  });
  it("monthly", () => {
    expect(describeCron("0 8 15 * *")).toBe("Day 15 of each month at 08:00");
  });
  it("twice daily", () => {
    expect(describeCron("0 8,18 * * *")).toBe("Every day at 08:00, 18:00");
  });
  it("returns input for malformed expressions", () => {
    expect(describeCron("nonsense")).toBe("nonsense");
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm test tests/cron/describe.test.ts`
Expected: FAIL — cannot import `@/lib/cron/describe` (module not found).

- [ ] **Step 3: Implement `lib/cron/describe.ts`**

```ts
const WEEKDAY_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export function formatTimeList(hour: string, minute: string): string {
  const minutes = minute.includes(",") ? minute.split(",") : [minute];
  const hours = hour.includes(",") ? hour.split(",") : [hour];
  const times: string[] = [];
  for (const h of hours) {
    for (const m of minutes) {
      const hh = parseInt(h);
      const mm = parseInt(m);
      if (!isNaN(hh) && !isNaN(mm)) {
        times.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      }
    }
  }
  return times.join(", ");
}

export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, day, month, weekday] = parts;
  const timeStr = formatTimeList(hour, minute);
  if (!timeStr) return cron;

  if (day === "*" && month === "*" && weekday === "*") {
    return `Every day at ${timeStr}`;
  }
  if (day === "*" && month === "*" && weekday === "1-5") {
    return `Weekdays at ${timeStr}`;
  }
  if (day === "*" && month === "*" && /^\d$/.test(weekday)) {
    return `Every ${WEEKDAY_NAMES[parseInt(weekday)] ?? weekday} at ${timeStr}`;
  }
  if (day === "*" && month === "*" && weekday.includes(",")) {
    const days = weekday
      .split(",")
      .map((v) => WEEKDAY_NAMES[parseInt(v)] ?? v);
    return `Every ${days.join(", ")} at ${timeStr}`;
  }
  if (/^\d+$/.test(day) && month === "*" && weekday === "*") {
    return `Day ${day} of each month at ${timeStr}`;
  }

  return cron;
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm test tests/cron/describe.test.ts`
Expected: PASS (all 9 assertions).

- [ ] **Step 5: Rewire + i18n `components/cron-builder.tsx`**

In `components/cron-builder.tsx`:
1. Add at top: `import { describeCron, formatTimeList } from "@/lib/cron/describe";`
2. Delete the local `formatTimeList` and `describeCron` function definitions (lines ~36–82).
3. Keep `validateCron`, but change its message: `return "无效的 Cron 表达式";` → `return "Invalid cron expression";`
4. Replace `WEEKDAYS` labels:
```ts
const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];
```
5. Replace `presets`:
```ts
  const presets: { key: CronPreset; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "custom", label: "Custom" },
  ];
```
6. JSX label strings: `时`→`Hour`, `分`→`Minute`, `日期`→`Day`, `{d}号`→`{d}`, `Cron 表达式`→`Cron expression`, hint `格式：分 时 日 月 周　例：` → `Format: min hour day month weekday — e.g. `, `（每天两次）` → ` (twice daily)`.
7. Mode tab buttons `rounded-lg`, weekday buttons `rounded-lg` — keep (6px). No radius change needed.

- [ ] **Step 6: Run full test suite + type check**

Run: `pnpm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/cron/describe.ts tests/cron/describe.test.ts components/cron-builder.tsx
git commit -m "feat(settings): extract+test cron describe, English cron-builder"
```

---

## Phase 5 — Settings redesign

### Task 15: Create SettingRow + SettingsSubTabs primitives

**Files:**
- Create: `components/settings/setting-row.tsx`
- Create: `components/settings/settings-sub-tabs.tsx`

- [ ] **Step 1: Write `setting-row.tsx`**

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  /** stack the control below the text instead of right-aligned */
  stacked?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function SettingRow({ title, description, control, stacked, className, children }: SettingRowProps) {
  return (
    <div
      className={cn(
        "flex gap-4 py-3",
        stacked ? "flex-col" : "items-center justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium leading-none">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {control && <div className="shrink-0">{control}</div>}
      {children}
    </div>
  );
}

export { SettingRow };
```

- [ ] **Step 2: Write `settings-sub-tabs.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface SettingsSubTab {
  key: string;
  label: string;
}

interface SettingsSubTabsProps {
  tabs: SettingsSubTab[];
  active: string;
  onChange: (key: string) => void;
}

function SettingsSubTabs({ tabs, active, onChange }: SettingsSubTabsProps) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "relative px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { SettingsSubTabs };
export type { SettingsSubTab };
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/settings/setting-row.tsx components/settings/settings-sub-tabs.tsx
git commit -m "feat(settings): add SettingRow + SettingsSubTabs primitives"
```

---

### Task 16: Reskin appearance-section with Segmented

**Files:**
- Modify: `components/settings/appearance-section.tsx`

- [ ] **Step 1: Replace the body with a SettingRow + Segmented**

Replace the whole file with:

```tsx
"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { SettingRow } from "@/components/settings/setting-row";

const themeOptions: SegmentedOption<string>[] = [
  { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun className="size-3.5" />Light</span> },
  { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5" />Dark</span> },
  { value: "system", label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-3.5" />System</span> },
];

interface Props {
  theme?: string;
  mounted: boolean;
  onSelect: (key: string) => void;
}

export function AppearanceSection({ theme, mounted, onSelect }: Props) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Choose your preferred theme</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <SettingRow
          title="Theme"
          description="Light, dark, or follow your system"
          control={
            <Segmented
              value={mounted ? (theme ?? "system") : "system"}
              options={themeOptions}
              onChange={onSelect}
            />
          }
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/appearance-section.tsx
git commit -m "feat(settings): row + segmented appearance section"
```

---

### Task 17: Reskin feeds-section as rows

**Files:**
- Modify: `components/settings/feeds-section.tsx`

- [ ] **Step 1: Card radius + button radius**

`Card className="rounded-2xl border-border/50"` → `className="rounded-lg"`. The three action `Button`s `rounded-xl` → `rounded-md`. The list wrapper `rounded-xl` → `rounded-md`; add `max-h-96 overflow-y-auto scrollbar-thin` to that wrapper so it scrolls internally:

Replace:
```tsx
          <div className="border border-border/50 rounded-xl divide-y divide-border/50 overflow-hidden">
```
with:
```tsx
          <div className="border border-border rounded-md divide-y divide-border overflow-y-auto scrollbar-thin max-h-96">
```

- [ ] **Step 2: Interval select → keep native select but sharpen**

Leave the `<select>` (it's compact already); change its `rounded-lg` to stay. The delete `Button` `rounded-lg` stays. No further change.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/settings/feeds-section.tsx
git commit -m "feat(settings): Geist feeds section with internal scroll"
```

---

### Task 18: Restructure digest-email-section into sub-tabs

**Files:**
- Modify: `components/settings/digest-email-section.tsx`

This is the largest settings change: split the one tall card into General/Schedule/SMTP/Feeds sub-tabs, swap the hand-rolled toggles for `Switch`, convert fields to rows, and translate copy. All props and handlers are unchanged.

- [ ] **Step 1: Add imports + sub-tab state**

At the top of the file add:
```tsx
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingsSubTabs, type SettingsSubTab } from "@/components/settings/settings-sub-tabs";
```
Inside `DigestEmailSection`, before the `return`, add:
```tsx
  const [tab, setTab] = useState("general");
  const enabled = emailSettings?.enabled ?? false;
  const subTabs: SettingsSubTab[] = [
    { key: "general", label: "General" },
    { key: "schedule", label: "Schedule" },
    { key: "smtp", label: "SMTP" },
    { key: "feeds", label: "Feeds" },
  ];
```

- [ ] **Step 2: Replace the card body structure**

Replace the `<Card ...>` opening and `CardContent` contents so that:
- `Card className="rounded-2xl border-border/50"` → `className="rounded-lg"`.
- After the loading guard, render the **General** tab content unconditionally inside `tab === "general"`, and when `enabled`, render `<SettingsSubTabs tabs={subTabs} active={tab} onChange={setTab} />` above the panels and gate Schedule/SMTP/Feeds panels by `tab`.

Concretely, replace the inner `<>...</>` (everything after the loading ternary) with:

```tsx
          <>
            {enabled && (
              <SettingsSubTabs tabs={subTabs} active={tab} onChange={setTab} />
            )}

            {/* General */}
            {(tab === "general" || !enabled) && (
              <div className="divide-y divide-border">
                <SettingRow
                  title="Enable email digest"
                  description="Receive a daily article summary"
                  control={
                    <Switch
                      checked={enabled}
                      onCheckedChange={onEmailToggle}
                      disabled={emailSaving || emailTesting}
                    />
                  }
                />
                {enabled && (
                  <SettingRow
                    title="Auto-save on click"
                    description="Save to starred when opened from email"
                    control={
                      <Switch
                        checked={emailSettings?.autoSaveOnClick ?? false}
                        onCheckedChange={onAutoSaveToggle}
                        disabled={emailSaving}
                      />
                    }
                  />
                )}
              </div>
            )}

            {/* Schedule */}
            {enabled && tab === "schedule" && (
              <div className="pt-1">
                <CronBuilder
                  value={pendingCron ?? emailSettings!.cronExpression}
                  onChange={onCronChange}
                  disabled={emailSaving || emailTesting}
                />
                {pendingCron !== null && pendingCron !== emailSettings!.cronExpression && (
                  <div className="flex items-center gap-2 mt-3">
                    <Button size="sm" className="rounded-md" disabled={emailSaving} onClick={onCronSave}>
                      {emailSaving ? "Saving…" : "Save schedule"}
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={onCronCancel}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SMTP */}
            {enabled && tab === "smtp" && (
              <div className="space-y-3 pt-1">
                {emailError && (
                  <div className="p-2 bg-destructive/10 text-destructive text-sm rounded-md">
                    {emailError}
                  </div>
                )}
                <div>
                  <label htmlFor="smtp-host" className="text-xs text-muted-foreground block mb-1">SMTP Host</label>
                  <input
                    id="smtp-host"
                    type="text"
                    placeholder="smtp.gmail.com"
                    value={emailSettings!.smtpHost || ""}
                    onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpHost: e.target.value } : null)}
                    onBlur={(e) => onSMTPChange("smtpHost", e.target.value)}
                    disabled={emailSaving || emailTesting}
                    className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="smtp-port" className="text-xs text-muted-foreground block mb-1">Port</label>
                    <input
                      id="smtp-port"
                      type="number"
                      placeholder="587"
                      value={emailSettings!.smtpPort || ""}
                      onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpPort: parseInt(e.target.value) || 587 } : null)}
                      onBlur={(e) => onSMTPChange("smtpPort", parseInt(e.target.value) || 587)}
                      disabled={emailSaving || emailTesting}
                      className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="smtp-from" className="text-xs text-muted-foreground block mb-1">From Name</label>
                    <input
                      id="smtp-from"
                      type="text"
                      placeholder="Feedwise"
                      value={emailSettings!.smtpFrom || ""}
                      onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpFrom: e.target.value } : null)}
                      onBlur={(e) => onSMTPChange("smtpFrom", e.target.value)}
                      disabled={emailSaving || emailTesting}
                      className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="smtp-user" className="text-xs text-muted-foreground block mb-1">Username / Email</label>
                  <input
                    id="smtp-user"
                    type="text"
                    placeholder="your-email@gmail.com"
                    value={emailSettings!.smtpUser || ""}
                    onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpUser: e.target.value } : null)}
                    onBlur={(e) => onSMTPChange("smtpUser", e.target.value)}
                    disabled={emailSaving || emailTesting}
                    className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="smtp-pass" className="text-xs text-muted-foreground block mb-1">Password / App Password</label>
                  <input
                    id="smtp-pass"
                    type="password"
                    placeholder="Enter password"
                    value={smtpPassDraft}
                    onChange={(e) => onSmtpPassDraftChange(e.target.value)}
                    onBlur={(e) => { if (e.target.value) onSMTPChange("smtpPass", e.target.value); }}
                    disabled={emailSaving || emailTesting}
                    className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                  />
                  {emailSettings!.hasSmtpPass && (
                    <p className="mt-1 text-[11px] text-muted-foreground">SMTP password is saved.</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-md"
                  onClick={onTestEmail}
                  disabled={
                    emailSaving || emailTesting || !isSmtpValid ||
                    (!emailSettings!.hasSmtpPass && smtpPassDraft.trim().length === 0)
                  }
                >
                  <Mail className="size-4 mr-2" />
                  {emailTesting ? "Sending…" : "Send Test Email"}
                </Button>
              </div>
            )}

            {/* Feeds */}
            {enabled && tab === "feeds" && (
              subs.length > 0 ? (
                <div className="pt-1">
                  <div className="border border-border rounded-md divide-y divide-border max-h-80 overflow-y-auto scrollbar-thin">
                    {subs.map((sub) => {
                      const checked = (emailSettings!.selectedFeeds || []).includes(sub.feedId);
                      return (
                        <button
                          type="button"
                          key={sub.id}
                          onClick={() => onFeedToggle(sub.feedId)}
                          disabled={emailSaving || emailTesting}
                          aria-checked={checked}
                          role="checkbox"
                          className="w-full text-left flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/30 disabled:opacity-60"
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                            checked ? "bg-primary border-primary" : "border-muted-foreground"
                          )}>
                            {checked && <Check className="size-3 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{sub.title ?? sub.feedTitle ?? sub.url}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {(emailSettings!.selectedFeeds || []).length === 0
                      ? "All feeds will be included"
                      : `${(emailSettings!.selectedFeeds || []).length} feed(s) selected`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pt-2">No feeds to choose from yet.</p>
              )
            )}
          </>
```

- [ ] **Step 3: Add the `SettingRow` import**

Add `import { SettingRow } from "@/components/settings/setting-row";` to the imports.

- [ ] **Step 4: Remove now-unused imports/markup**

Remove the old hand-rolled toggle `<button className="w-11 h-6 ...">` blocks (they were replaced by `Switch`). `BookOpen` import is no longer used (the "Select feeds to notify" heading is gone) — remove `BookOpen` from the lucide import; keep `Mail` and `Check`.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors (watch for unused-var TS errors → remove leftovers).

- [ ] **Step 6: Visual checklist**

`/settings` → Digest Email. When off: only the "Enable email digest" row. When on: sub-tab bar (General/Schedule/SMTP/Feeds), each panel short — no long scroll. Switches turn blue when on.

- [ ] **Step 7: Commit**

```bash
git add components/settings/digest-email-section.tsx
git commit -m "feat(settings): split digest into sub-tabs + Switch + English"
```

---

### Task 19: Reskin smart-digest-section

**Files:**
- Modify: `components/settings/smart-digest-section.tsx`

- [ ] **Step 1: Switch + rows**

Replace the file with:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "@/components/settings/setting-row";

interface Props {
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmKeyMask: string;
  llmSaving: boolean;
  llmTesting: boolean;
  onLlmEnabledChange: (enabled: boolean) => void;
  onLlmBaseUrlChange: (value: string) => void;
  onLlmApiKeyChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onSave: () => void;
  onTest: () => void;
}

export function SmartDigestSection({
  llmEnabled,
  llmBaseUrl,
  llmApiKey,
  llmModel,
  llmKeyMask,
  llmSaving,
  llmTesting,
  onLlmEnabledChange,
  onLlmBaseUrlChange,
  onLlmApiKeyChange,
  onLlmModelChange,
  onSave,
  onTest,
}: Props) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Smart Digest (Beta)</CardTitle>
        <CardDescription>
          When on, your digest is grouped by topic and ranked by importance. Uses your own OpenAI-compatible API. Off by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border">
          <SettingRow
            title="Enable LLM clustering"
            description="Group and rank articles before sending"
            control={<Switch checked={llmEnabled} onCheckedChange={onLlmEnabledChange} />}
          />
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">API Base URL</span>
            <input
              type="url"
              value={llmBaseUrl}
              onChange={(e) => onLlmBaseUrlChange(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">
              API Key {llmKeyMask && <span>· stored: {llmKeyMask}</span>}
            </span>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => onLlmApiKeyChange(e.target.value)}
              placeholder={llmKeyMask ? "(unchanged — leave blank to keep)" : "sk-..."}
              className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Model</span>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => onLlmModelChange(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="rounded-md" onClick={onSave} disabled={llmSaving}>
            {llmSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-md"
            onClick={onTest}
            disabled={llmTesting || !llmBaseUrl || !llmModel}
          >
            {llmTesting ? "Testing…" : "Test"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/smart-digest-section.tsx
git commit -m "feat(settings): Geist smart-digest with Switch"
```

---

### Task 20: Reskin account-section as rows

**Files:**
- Modify: `components/settings/account-section.tsx`

- [ ] **Step 1: Card radius + button radius**

`Card className="rounded-2xl border-border/50"` → `className="rounded-lg"`. Both `Button className="rounded-xl"` → `className="rounded-md"`. Both name/email `<input className="... rounded-lg ...">` keep (6px). Avatar `rounded-full` stays. The dividers `border-border/30` → `border-border`.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/account-section.tsx
git commit -m "feat(settings): Geist account section"
```

---

### Task 21: Reskin settings shell + English toast

**Files:**
- Modify: `app/(reader)/settings/page.tsx`

- [ ] **Step 1: English toast**

`toast.success("测试邮件发送成功")` → `toast.success("Test email sent")`.

- [ ] **Step 2: Shell radius + rail active state**

- Back `Button className="size-8 rounded-xl"` (2 occurrences) → `rounded-md`.
- Heading `text-xl font-bold` → `text-xl font-semibold`.
- Error `Card className="rounded-2xl border-border/50"` → `rounded-lg`.
- Mobile `<select className="... rounded-xl ...">` → `rounded-md`.
- Left rail buttons already use `rounded-xl` for the section items → `rounded-md`; active uses `bg-accent text-accent-foreground` (token-correct, keep).

- [ ] **Step 3: Type check + build**

Run: `npx tsc --noEmit && pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Visual checklist**

`/settings`: rail neutral with active item highlighted; each section flat; Digest sub-tabs working; no section requires long scrolling.

- [ ] **Step 5: Commit**

```bash
git add "app/(reader)/settings/page.tsx"
git commit -m "feat(settings): Geist settings shell + English toast"
```

---

## Phase 6 — Finalize

### Task 22: Full verification + residual copy sweep

**Files:** (verification only; fix any stragglers found)

- [ ] **Step 1: Hunt residual Chinese strings in the web UI**

Run: `grep -rnP "[\x{4e00}-\x{9fff}]" app components --include=*.tsx`
Expected: no output. If any remain, translate to English (do not touch `lib/email/templates` or digest pipeline — out of scope), then re-run.

- [ ] **Step 2: Hunt residual heavy radius in app/components surfaces**

Run: `grep -rn "rounded-2xl\|rounded-xl\|hover:-translate-y\|shadow-lg" app components`
Expected: no output (or only intentional cases you accept). Fix per the radius rule.

- [ ] **Step 3: Full type check, tests, build**

Run: `npx tsc --noEmit && pnpm test && pnpm build`
Expected: clean type check, all tests pass, successful production build.

- [ ] **Step 4: Manual smoke (dev)**

`pnpm dev` and click through: `/login`, `/register`, `/reader` (dashboard), a feed view (3-column), open an article, `/discover`, `/settings` (all 5 sections + digest sub-tabs), toggle light/dark. No console warnings/hydration errors.

- [ ] **Step 5: Commit any stragglers**

```bash
git add -A
git commit -m "chore(ui): final Geist redesign cleanup + English copy sweep"
```

- [ ] **Step 6: Update the ui_style memory**

Update the project memory file noting the new Geist system (neutral grayscale + blue accent, ~6px radius, Geist font, dark default, 3-column reader, compact-row + sub-tab settings) replacing the old "Reeder-style" description. (This is a memory-file edit, not a repo commit.)

---

## Self-review (completed during planning)

- **Spec coverage:** tokens (T2) · fonts (T1) · primitives incl. Switch/Segmented (T3–T6) · reader 3-column (T11) · sidebar/list/reader/dashboard (T7–T10) · discover/auth (T12–T13) · settings rows+sub-tabs incl. SettingRow/SettingsSubTabs (T15–T21) · cron extraction+tests (T14) · English sweep (T7–T9,T11,T14,T18,T21,T22) · testing posture (T14 + per-task checks) · memory follow-up (T22). All spec sections map to tasks.
- **Placeholder scan:** no TBD/TODO; every code step shows full code or exact before→after strings and grep verifications.
- **Type consistency:** `Switch` uses `checked`/`onCheckedChange`; `Segmented` uses `value`/`options`/`onChange`; `SettingRow` uses `title`/`description`/`control`; `SettingsSubTabs` uses `tabs`/`active`/`onChange`; `describeCron`/`formatTimeList` signatures match across `lib/cron/describe.ts`, its test, and `cron-builder.tsx`.
