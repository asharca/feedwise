# Reader UI Refactor Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erase the ~150 lines of logic duplicated across the three reader pages (`/reader`, `/reader/history`, `/reader/tags`) by extracting shared reader primitives, and split the 1164-line `components/layout/app-sidebar.tsx` (27 useState) into focused components that own their own dialog state.

**Architecture:** New `lib/reader/` module (typed cross-component events, article API client, shared detail type) + three small hooks in `lib/hooks/` (debounced value, auto-summarize preference, URL-driven article detail with mark-read-on-open). Pages keep their layout/navigation differences; only the duplicated mechanics move. The sidebar becomes an orchestrator (~450 lines) composing self-contained dialog components and presentational pieces under `components/layout/sidebar/`.

**Tech Stack:** Next.js 16 App Router (client components), React 19, Vitest + @testing-library/react `renderHook` (jsdom). Tests live in `tests/**/*.test.ts` (note: `.ts`, not `.tsx` — the vitest include pattern only matches `.test.ts`; renderHook needs no JSX).

**Verification baseline:** branch `refactor/architecture-deepening`; `pnpm build` clean and `pnpm test` = 36 files / 227 tests green before this plan starts. Zero behavior change intended except where noted (each noted change is an improvement, listed in B2).

**Out of scope (deliberate):**
- Unifying `news-dashboard.tsx`'s local ArticleCard with `components/article/article-card.tsx` — the two serve different layouts (magazine hero/compact vs. list pane with search highlighting); merging needs visual QA behind an auth-gated UI. Not worth the regression risk now.
- Adopting React Query / a global `useApi()` — dependency decision for the user, not a refactor.
- `settings-content.tsx` prop drilling — separate area, separate plan if wanted.
- The `"tags-changed"` and `"feedwise:focus-search"` window events — only the two state-sync events (unread-delta, mark-all-read) get typed constants, because they cross the page↔sidebar boundary.

**Conventions for all tasks:** conventional commits, NO attribution footer; `pnpm build && pnpm test` must pass before each commit; match existing code style; verbatim moves where specified.

---

### Task B1: Shared reader primitives (lib/reader + lib/hooks) — TDD

**Files:**
- Create: `lib/reader/types.ts`
- Create: `lib/reader/events.ts`
- Create: `lib/reader/article-api.ts`
- Create: `lib/hooks/use-debounced-value.ts`
- Create: `lib/hooks/use-auto-summarize.ts`
- Create: `lib/hooks/use-article-detail.ts`
- Test: `tests/hooks/use-debounced-value.test.ts`
- Test: `tests/hooks/use-auto-summarize.test.ts`
- Test: `tests/hooks/use-article-detail.test.ts`

- [ ] **Step 1: Write the failing tests** (all three files; run them, expect module-not-found failures)

```typescript
// tests/hooks/use-debounced-value.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 250));
    expect(result.current).toBe("a");
  });

  it("only adopts a new value after the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe("ab");
  });

  it("restarts the timer when the value changes mid-delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ v: "abc" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("a"); // neither update has settled yet
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe("abc");
  });
});
```

```typescript
// tests/hooks/use-auto-summarize.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe("useAutoSummarize", () => {
  it("is null until the config loads, then true when enabled + opted in", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ enabled: true, autoSummarize: true }));
    const { result } = renderHook(() => useAutoSummarize());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/email/llm/config");
  });

  it("is false when LLM is enabled but auto-summarize is off", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ enabled: true, autoSummarize: false }));
    const { result } = renderHook(() => useAutoSummarize());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("is false when the request fails", async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(new Error("network")));
    const { result } = renderHook(() => useAutoSummarize());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("is false when the response is not ok", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({}, false));
    const { result } = renderHook(() => useAutoSummarize());
    await waitFor(() => expect(result.current).toBe(false));
  });
});
```

```typescript
// tests/hooks/use-article-detail.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { UNREAD_DELTA_EVENT, type UnreadDeltaDetail } from "@/lib/reader/events";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function detailResponse(overrides: Record<string, unknown> = {}) {
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          id: "a1",
          feedId: "f1",
          feedTitle: "Feed",
          url: "https://e.com/1",
          title: "T",
          author: null,
          summary: null,
          contentHtml: null,
          contentText: null,
          publishedAt: null,
          createdAt: null,
          isRead: false,
          isStarred: false,
          ...overrides,
        },
      }),
  } as Response);
}

function patchResponse() {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);
}

describe("useArticleDetail", () => {
  it("is null when articleId is undefined", () => {
    const { result } = renderHook(() => useArticleDetail(undefined, { markReadOnOpen: false }));
    expect(result.current.detail).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the detail for an articleId", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/articles/a1");
  });

  it("marks an unread article read on open: PATCH + unread-delta event + callback", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: false }));
    fetchMock.mockReturnValueOnce(patchResponse());
    const deltas: UnreadDeltaDetail[] = [];
    const onDelta = (e: Event) => deltas.push((e as CustomEvent<UnreadDeltaDetail>).detail);
    window.addEventListener(UNREAD_DELTA_EVENT, onDelta);
    const onMarkedRead = vi.fn();
    const { result } = renderHook(() =>
      useArticleDetail("a1", { markReadOnOpen: true, onMarkedRead }),
    );
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    await waitFor(() => expect(onMarkedRead).toHaveBeenCalledWith("a1"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/articles/a1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isRead: true }) }),
    );
    expect(deltas).toEqual([{ feedId: "f1", delta: -1 }]);
    window.removeEventListener(UNREAD_DELTA_EVENT, onDelta);
  });

  it("does NOT mark read when markReadOnOpen is false", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: false }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(fetchMock).toHaveBeenCalledTimes(1); // detail fetch only, no PATCH
  });

  it("does NOT mark an already-read article again", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: true }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the detail when articleId becomes undefined", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) => useArticleDetail(id, { markReadOnOpen: false }),
      { initialProps: { id: "a1" as string | undefined } },
    );
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    rerender({ id: undefined });
    expect(result.current.detail).toBeNull();
  });

  it("exposes setDetail so callers can apply optimistic updates", async () => {
    fetchMock.mockReturnValueOnce(detailResponse({ isRead: true }));
    const { result } = renderHook(() => useArticleDetail("a1", { markReadOnOpen: false }));
    await waitFor(() => expect(result.current.detail?.id).toBe("a1"));
    const { act } = await import("@testing-library/react");
    act(() => {
      result.current.setDetail((prev) => (prev ? { ...prev, isStarred: true } : prev));
    });
    expect(result.current.detail?.isStarred).toBe(true);
  });
});
```

Run: `pnpm vitest run tests/hooks` → the three new files FAIL (modules missing); `use-sse.test.ts` still passes.

- [ ] **Step 2: Implement `lib/reader/types.ts`**

```typescript
/**
 * The article detail shape returned by GET /api/articles/[id], as consumed by
 * the reader pages. Dates are ISO strings (callers convert to Date at the
 * ArticleReader boundary).
 */
export interface ReaderArticleDetail {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl?: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  contentHtml: string | null;
  contentText: string | null;
  imageUrl?: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  aiSummary?: string | null;
  importance?: "high" | "med" | "low" | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
}
```

- [ ] **Step 3: Implement `lib/reader/events.ts`**

```typescript
/**
 * Window-level events that sync read-state between the reader pages and the
 * sidebar's unread counters. Dispatchers and listeners must share these
 * constants — never re-type the strings.
 */
export const UNREAD_DELTA_EVENT = "feedwise:unread-delta";
export const MARK_ALL_READ_EVENT = "feedwise:mark-all-read";

export interface UnreadDeltaDetail {
  feedId: string;
  delta: number;
}

export interface MarkAllReadDetail {
  feedId?: string;
  folderId?: string;
}

export function dispatchUnreadDelta(feedId: string, delta: number): void {
  window.dispatchEvent(
    new CustomEvent<UnreadDeltaDetail>(UNREAD_DELTA_EVENT, { detail: { feedId, delta } }),
  );
}

export function dispatchMarkAllRead(feedId?: string, folderId?: string): void {
  window.dispatchEvent(
    new CustomEvent<MarkAllReadDetail>(MARK_ALL_READ_EVENT, { detail: { feedId, folderId } }),
  );
}
```

- [ ] **Step 4: Implement `lib/reader/article-api.ts`**

```typescript
import type { ReaderArticleDetail } from "./types";

/** Fetch one article's full detail. Returns null on any failure. */
export async function fetchArticleDetail(id: string): Promise<ReaderArticleDetail | null> {
  const res = await fetch(`/api/articles/${id}`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.success ? (data.data as ReaderArticleDetail) : null;
}

/**
 * Persist a read/star change. Best-effort: the reader UIs update
 * optimistically and a lost PATCH self-heals on the next list fetch.
 */
export async function patchArticle(
  id: string,
  patch: { isRead?: boolean; isStarred?: boolean },
): Promise<void> {
  await fetch(`/api/articles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}
```

- [ ] **Step 5: Implement `lib/hooks/use-debounced-value.ts`**

```typescript
import { useEffect, useState } from "react";

/** Returns `value`, but only adopts changes after `delayMs` of quiet. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 6: Implement `lib/hooks/use-auto-summarize.ts`**

```typescript
import { useEffect, useState } from "react";

/**
 * The user's reader-level auto-summarize preference (LLM enabled AND opted
 * in). `null` until loaded — callers that auto-trigger summaries must treat
 * null as "don't trigger yet".
 */
export function useAutoSummarize(): boolean | null {
  const [autoSummarize, setAutoSummarize] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/email/llm/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setAutoSummarize(data ? Boolean(data.enabled) && Boolean(data.autoSummarize) : false);
      })
      .catch(() => {
        if (!cancelled) setAutoSummarize(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return autoSummarize;
}
```

- [ ] **Step 7: Implement `lib/hooks/use-article-detail.ts`**

```typescript
import { useEffect, useState, useTransition } from "react";
import type { Dispatch, SetStateAction } from "react";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { fetchArticleDetail, patchArticle } from "@/lib/reader/article-api";
import type { ReaderArticleDetail } from "@/lib/reader/types";

export interface UseArticleDetailOptions {
  /** Mark the article read (server PATCH + unread-delta event) when it opens unread. */
  markReadOnOpen: boolean;
  /** Called after an unread article was marked read on open. */
  onMarkedRead?: (articleId: string) => void;
}

export interface UseArticleDetailResult {
  detail: ReaderArticleDetail | null;
  setDetail: Dispatch<SetStateAction<ReaderArticleDetail | null>>;
}

/**
 * URL-driven article detail: fetches whenever `articleId` changes, clears
 * when it goes away, and (optionally) marks the article read on open. The
 * state update is wrapped in a transition so the heavy reader mount can't
 * block an in-flight slide-in animation.
 */
export function useArticleDetail(
  articleId: string | undefined,
  { markReadOnOpen, onMarkedRead }: UseArticleDetailOptions,
): UseArticleDetailResult {
  const [detail, setDetail] = useState<ReaderArticleDetail | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!articleId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await fetchArticleDetail(articleId);
      if (cancelled || !data) return;
      startTransition(() => {
        setDetail(data);
      });
      if (markReadOnOpen && !data.isRead) {
        patchArticle(articleId, { isRead: true });
        if (data.feedId) dispatchUnreadDelta(data.feedId, -1);
        onMarkedRead?.(articleId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // markReadOnOpen/onMarkedRead intentionally excluded: the fetch must run
    // exactly once per articleId change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  return { detail, setDetail };
}
```

- [ ] **Step 8: Run the new tests → PASS; then `pnpm build && pnpm test` → all green**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(reader): shared reader primitives — events, article API, detail/auto-summarize/debounce hooks"
```

---

### Task B2: Make the three reader pages consume the primitives

Pure refactor — behavior identical, except two intended improvements: (a) clearing the pane-search input now applies immediately instead of after the 250ms debounce; (b) read/star PATCH failures are now uniformly swallowed (they were already unawaited/uncaught in practice).

**Files:**
- Modify: `app/(reader)/reader/page.tsx`
- Modify: `app/(reader)/reader/history/page.tsx`
- Modify: `app/(reader)/reader/tags/page.tsx`
- Modify: `components/layout/app-sidebar.tsx` (event-name constants only)

- [ ] **Step 1: `app/(reader)/reader/page.tsx`**

1. Add imports: `useAutoSummarize`, `useDebouncedValue`, `useArticleDetail`, `dispatchUnreadDelta`, `dispatchMarkAllRead`, `patchArticle`, and `type ReaderArticleDetail`.
2. DELETE the local `interface ArticleDetail` (lines 19–27) — use `ReaderArticleDetail` where it was referenced.
3. REPLACE `const [autoSummarize, setAutoSummarize] = useState<boolean | null>(null);` + the `/api/email/llm/config` useEffect (lines 86–97) with `const autoSummarize = useAutoSummarize();`.
4. REPLACE the pane-search debounce pair:
   - delete `const [debouncedPaneSearch, setDebouncedPaneSearch] = useState("");` and its debounce useEffect (lines 74–77);
   - add `const debouncedPaneSearch = useDebouncedValue(paneSearch.trim(), 250);`
   - add `const effectivePaneSearch = paneSearch.trim() === "" ? "" : debouncedPaneSearch;` and use `effectivePaneSearch` everywhere `debouncedPaneSearch` was used (fetchArticles dep + emptyTitle/emptyHint conditions);
   - in the scope-change reset effect (lines 81–84), keep `setPaneSearch("")` and drop `setDebouncedPaneSearch("")` (the `effectivePaneSearch` guard makes the clear instantaneous).
5. REPLACE the `activeArticle` state + the articleId-driven useEffect (lines 40, 182–221) with:

```typescript
const { detail: activeArticle, setDetail: setActiveArticle } = useArticleDetail(articleId, {
  markReadOnOpen: true,
  onMarkedRead: (id) => {
    setArticleList((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
  },
});
```

   (The unread-delta dispatch now happens inside the hook. The transition wrapping also lives in the hook.)
6. DELETE the local `dispatchUnreadDelta` and `dispatchMarkAllRead` functions (lines 282–292) — the imported ones replace them (`dispatchMarkAllRead(feedId, folderId)` keeps positional args).
7. In `handleStar` and `handleMarkRead`, replace the inline `fetch(... PATCH ...)` calls with `await patchArticle(id, { isStarred: starred })` / `await patchArticle(id, { isRead: read })`.
8. Everything else (pagination, aborts, dashboard/search modes, history push/pop) stays untouched.

- [ ] **Step 2: `app/(reader)/reader/history/page.tsx`**

1. DELETE the local `interface ArticleDetail` (lines 19–38) → use `ReaderArticleDetail`.
2. DELETE the module-level `dispatchUnreadDelta` (lines 42–44) → import from `@/lib/reader/events`.
3. REPLACE the autoSummarize state + effect (lines 58, 66–73) with `const autoSummarize = useAutoSummarize();` and pass `autoSummarize={autoSummarize ?? false}` to ArticleReader (preserves the old `false` initial behavior).
4. REPLACE the search debounce pair (lines 55–56, 61–64) with `const debouncedSearch = useDebouncedValue(search.trim(), 250);` (history has no scope-reset; no `effective` guard needed).
5. REPLACE the `active` state + articleId effect (lines 57, 106–123) with `const { detail: active, setDetail: setActive } = useArticleDetail(articleId, { markReadOnOpen: false });`.
6. In `handleStar`/`handleMarkRead`, replace inline PATCH fetches with `patchArticle(...)`.

- [ ] **Step 3: `app/(reader)/reader/tags/page.tsx`**

1. DELETE `interface ApiArticleDetail` (lines 37–45) → use `ReaderArticleDetail` for `active`.
2. DELETE the module-level `dispatchUnreadDelta` (lines 55–57) → import from `@/lib/reader/events`.
3. REPLACE autoSummarize state + effect (lines 70, 89–96) with `const autoSummarize = useAutoSummarize();`; pass `autoSummarize={autoSummarize ?? false}`.
4. REPLACE the pane-search debounce pair (lines 99–104) with `const debouncedPaneSearch = useDebouncedValue(paneSearch.trim(), 250);` plus `const effectivePaneSearch = paneSearch.trim() === "" ? "" : debouncedPaneSearch;`; in the tagId reset effect keep `setPaneSearch("")` only; use `effectivePaneSearch` in the article-fetch effect deps/params and empty-state conditions.
5. REPLACE the `active` state + articleId effect (lines 69, 138–164) with:

```typescript
const { detail: active, setDetail: setActive } = useArticleDetail(articleId, {
  markReadOnOpen: true,
  onMarkedRead: (id) => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
  },
});
```

6. In `handleStar`/`handleMarkRead`, replace inline PATCH fetches with `patchArticle(...)`.

- [ ] **Step 4: `components/layout/app-sidebar.tsx` — event constants**

In the unread-sync useEffect (lines 173–202): import `UNREAD_DELTA_EVENT`, `MARK_ALL_READ_EVENT`, `type UnreadDeltaDetail`, `type MarkAllReadDetail` from `@/lib/reader/events`; replace the four string literals `"feedwise:unread-delta"` / `"feedwise:mark-all-read"` with the constants and the two inline `CustomEvent<...>` detail casts with the imported types. No behavior change.

- [ ] **Step 5: Verify**

```bash
grep -rn "feedwise:unread-delta\|feedwise:mark-all-read" app components | grep -v "lib/reader"
```
Expected: no output (all four former literal sites now use constants).
Run: `pnpm build && pnpm test` → green. Also `grep -n "email/llm/config" app/\(reader\)` → no hits left in pages.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(reader): three reader pages consume shared detail/auto-summarize/debounce primitives"
```

---

### Task B3: Split app-sidebar.tsx into focused components

`components/layout/app-sidebar.tsx` (1164 lines, 27 useState) becomes an orchestrator. Dialog form state moves INTO self-contained dialog components; feed row and folder group become presentational components fed by an actions object. All JSX/handlers move VERBATIM unless a step says otherwise — this is a relocation, not a redesign.

**Files:**
- Create: `components/layout/sidebar/types.ts`
- Create: `components/layout/sidebar/parse-feed-urls.ts`
- Create: `components/layout/sidebar/add-feed-dialog.tsx`
- Create: `components/layout/sidebar/rename-feed-dialog.tsx`
- Create: `components/layout/sidebar/edit-feed-url-dialog.tsx`
- Create: `components/layout/sidebar/folder-dialogs.tsx` (CreateFolderDialog + RenameFolderDialog — two small siblings, one file)
- Create: `components/layout/sidebar/feed-item.tsx`
- Create: `components/layout/sidebar/folder-group.tsx`
- Create: `components/layout/sidebar/sidebar-nav.tsx`
- Modify: `components/layout/app-sidebar.tsx`
- Test: `tests/sidebar/parse-feed-urls.test.ts`

- [ ] **Step 1: `types.ts`** — move the `Subscription` and `Folder` interfaces verbatim from app-sidebar.tsx (lines 81–100) and export both.

- [ ] **Step 2: TDD the one pure function.** Write `tests/sidebar/parse-feed-urls.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseFeedUrlLines } from "@/components/layout/sidebar/parse-feed-urls";

describe("parseFeedUrlLines", () => {
  it("splits one URL per line and trims whitespace", () => {
    expect(parseFeedUrlLines("  https://a.com/rss  \nhttps://b.com/feed\n")).toEqual([
      "https://a.com/rss",
      "https://b.com/feed",
    ]);
  });

  it("drops empty lines", () => {
    expect(parseFeedUrlLines("https://a.com/rss\n\n   \nhttps://b.com/feed")).toEqual([
      "https://a.com/rss",
      "https://b.com/feed",
    ]);
  });

  it("returns [] for blank input", () => {
    expect(parseFeedUrlLines("   \n  ")).toEqual([]);
  });
});
```

Run → fails. Implement `parse-feed-urls.ts`:

```typescript
/** One feed URL per line; trims and drops blanks. */
export function parseFeedUrlLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
```

Run → passes.

- [ ] **Step 3: `add-feed-dialog.tsx`** — owns feedUrl/addError/adding state. Move `handleAddFeed` (lines 283–321) and the Add Feed dialog JSX (lines 989–1014) verbatim, with the URL-splitting block replaced by `parseFeedUrlLines(feedUrl)`. Interface:

```typescript
"use client";
export interface AddFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the refreshed subscription list after a successful add. */
  onSubsRefreshed: (subs: Subscription[]) => void;
}
export function AddFeedDialog({ open, onOpenChange, onSubsRefreshed }: AddFeedDialogProps) { ... }
```

Inside, the success path (`const subsRes = await fetch("/api/feeds"); ...`) calls `onSubsRefreshed(subsData.data)`; `setAddOpen(false)` becomes `onOpenChange(false)`.

- [ ] **Step 4: `rename-feed-dialog.tsx`** — owns renameName/renaming state. Move `handleRename` (lines 329–350) + dialog JSX (lines 1017–1049). Interface:

```typescript
export interface RenameFeedDialogProps {
  open: boolean;
  target: Subscription | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the new custom title (null = cleared) after a successful save. */
  onRenamed: (subscriptionId: string, title: string | null) => void;
}
```

The component seeds `renameName` from `target` when it opens (a `useEffect` on `[open, target]` setting `setRenameName(target?.title ?? target?.feedTitle ?? "")` replaces the parent's `openRename` seeding).

- [ ] **Step 5: `edit-feed-url-dialog.tsx`** — owns editUrlValue/editUrlSaving/editUrlError. Move `handleEditUrl` (lines 359–381) + dialog JSX (lines 1126–1161). Interface mirrors rename:

```typescript
export interface EditFeedUrlDialogProps {
  open: boolean;
  target: Subscription | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (subscriptionId: string, url: string) => void;
}
```

Seeds `editUrlValue` from `target.url` on open; clears error on open.

- [ ] **Step 6: `folder-dialogs.tsx`** — `CreateFolderDialog` (owns name/saving/error; moves `handleFolderCreate` lines 471–500 + JSX lines 1055–1088; props `{ open, onOpenChange, onCreated: (folder: Folder) => void }`) and `RenameFolderDialog` (owns name/saving/error; moves `handleFolderRename` lines 423–450 + JSX lines 1091–1123; props `{ open, target: Folder | null, onOpenChange, onRenamed: (folderId: string, name: string) => void }`, seeds name from target on open).

- [ ] **Step 7: `feed-item.tsx`** — move `FeedIcon` (lines 543–562) and `renderFeedItem` (lines 564–692) verbatim as:

```typescript
export interface FeedItemActions {
  onNavigate: (sub: Subscription) => void;
  onMarkAllRead: (sub: Subscription) => void;
  onRefresh: (sub: Subscription) => void;
  onRename: (sub: Subscription) => void;
  onEditUrl: (sub: Subscription) => void;
  onMoveToFolder: (sub: Subscription, folderId: string | null) => void;
  onDelete: (sub: Subscription) => void;
}

export interface FeedItemProps {
  sub: Subscription;
  folders: Folder[];
  isActive: boolean;
  actions: FeedItemActions;
}

export function FeedItem({ sub, folders, isActive, actions }: FeedItemProps) { ... }
```

Inside, `navigate({...})` becomes `actions.onNavigate(sub)`, `handleMarkFeedAllRead(sub)` → `actions.onMarkAllRead(sub)`, etc. `foldersState` → the `folders` prop. `activeFeedId === sub.feedId` → the `isActive` prop.

- [ ] **Step 8: `folder-group.tsx`** — move `SortableFolderGroup` (lines 694–802) verbatim as:

```typescript
export interface FolderGroupProps {
  folder: Folder;
  folderSubs: Subscription[];
  folders: Folder[];
  unreadCount: number;
  isCollapsed: boolean;
  isActiveFolder: boolean;
  activeFeedId: string | null;
  onToggle: (folderId: string) => void;
  onViewAll: (folder: Folder) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  feedActions: FeedItemActions;
}

export function SortableFolderGroup(props: FolderGroupProps) { ... }
```

It renders `<FeedItem key={sub.id} sub={sub} folders={props.folders} isActive={props.activeFeedId === sub.feedId} actions={props.feedActions} />` for each sub. `collapsedFolders.has(...)` / `folderUnreadCount(...)` / `activeFolderId === ...` become the corresponding props; `toggleFolder` → `onToggle`, the "View all in folder" item → `onViewAll(folder)`, `openFolderRename` → `onRename`, `handleFolderDelete` → `onDelete`.

- [ ] **Step 9: `sidebar-nav.tsx`** — move the `smartViews` + `navLinks` consts (lines 107–118) and the smart-views/nav-links SidebarGroup JSX (lines 848–914). The component is self-contained: it calls `useRouter`, `usePathname`, `useSearchParams`, `useSidebar` itself. Props: `{ totalUnread: number }`. (The `feedwise:focus-search` literal stays as-is — out of scope.)

- [ ] **Step 10: Rewrite `components/layout/app-sidebar.tsx` as the orchestrator.** It keeps:
   - subs/foldersState state, SSE handler, unread-delta/mark-all-read listeners (with the Task B2 constants), scroll persistence, collapsedFolders, dnd sensors + `handleFolderDragEnd`, `navigate`, `toggleFolder`, `folderUnreadCount`, the folderMap/uncategorized grouping, totalUnread;
   - the network mutations that update shared state: `handleMarkFeedAllRead`, `handleRefresh`, `handleDelete`, `handleMoveFeedToFolder`, `handleFolderDelete` (these stay because they mutate `subs`/`foldersState` and don't own dialog UI);
   - dialog open/target state ONLY: `addOpen`, `renameTarget` (+`renameOpen`), `editUrlTarget` (+`editUrlOpen`), `folderCreateOpen`, `folderRenameTarget` (+`folderRenameOpen`), `aiSearchOpen`;
   - composition: header, `<SidebarNav totalUnread={totalUnread} />`, DndContext → `SortableFolderGroup` instances, uncategorized list of `<FeedItem>`, footer, and the six dialog components wired with callbacks that apply the optimistic state updates the old inline handlers did:

```typescript
const feedActions: FeedItemActions = {
  onNavigate: (sub) => navigate({ feedId: sub.feedId, folderId: null, tag: null, view: "all" }),
  onMarkAllRead: handleMarkFeedAllRead,
  onRefresh: handleRefresh,
  onRename: (sub) => { setRenameTarget(sub); setRenameOpen(true); },
  onEditUrl: (sub) => { setEditUrlTarget(sub); setEditUrlOpen(true); },
  onMoveToFolder: handleMoveFeedToFolder,
  onDelete: handleDelete,
};
```

```tsx
<AddFeedDialog open={addOpen} onOpenChange={setAddOpen} onSubsRefreshed={setSubs} />
<RenameFeedDialog
  open={renameOpen}
  target={renameTarget}
  onOpenChange={setRenameOpen}
  onRenamed={(id, title) => setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)))}
/>
<EditFeedUrlDialog
  open={editUrlOpen}
  target={editUrlTarget}
  onOpenChange={setEditUrlOpen}
  onSaved={(id, url) => setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, url } : s)))}
/>
<CreateFolderDialog
  open={folderCreateOpen}
  onOpenChange={setFolderCreateOpen}
  onCreated={(folder) => setFoldersState((prev) => [...prev, folder])}
/>
<RenameFolderDialog
  open={folderRenameOpen}
  target={folderRenameTarget}
  onOpenChange={setFolderRenameOpen}
  onRenamed={(folderId, name) =>
    setFoldersState((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)))
  }
/>
```

   Target: app-sidebar.tsx well under 500 lines; every extracted file under 250.

- [ ] **Step 11: Verify**

Run: `pnpm build && pnpm test` → green.
Run: `wc -l components/layout/app-sidebar.tsx components/layout/sidebar/*.tsx components/layout/sidebar/*.ts` — confirm the size targets.
Run: `grep -c "useState" components/layout/app-sidebar.tsx` — expect ≤ 10.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(sidebar): split app-sidebar into focused components with self-owned dialog state"
```

---

### Task B4: Final verification

- [ ] **Step 1:** `pnpm build && pnpm test` — green; report test count delta vs the 227 baseline.
- [ ] **Step 2:** `grep -rn "feedwise:unread-delta\|feedwise:mark-all-read" app components | grep -v lib/reader` → empty; `grep -rn "api/email/llm/config" app/\(reader\)` → empty.
- [ ] **Step 3:** `git diff main --stat | tail -3` sanity check; working tree clean.

---

## Self-review checklist (done at plan time)

- Coverage: candidate 5's two halves (page duplication → B1+B2; sidebar split → B3) both have tasks; deliberate scope-outs documented in the header.
- Type consistency: `ReaderArticleDetail` defined once in B1 Step 2 and consumed in B2 steps 1–3; `UseArticleDetailOptions.markReadOnOpen/onMarkedRead` names match between hook (B1 Step 7), tests (B1 Step 1) and page wiring (B2); `FeedItemActions` shape matches between feed-item.tsx (B3 Step 7), folder-group.tsx (B3 Step 8) and the orchestrator wiring (B3 Step 10).
- Known risks: (1) `/api/email/llm/config` returns a FLAT object (not the success envelope) — the hook copies the page's exact parsing, do not "fix" it; (2) vitest only picks up `tests/**/*.test.ts` — keep hook tests `.ts`; (3) the rename/edit-url dialogs must seed their inputs when `open` flips true (the parent no longer pre-seeds).
