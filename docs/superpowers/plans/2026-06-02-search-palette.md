# Search Palette Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `⌘K` sidebar search palette into a unified finder — snippet highlighting, sectioned Articles/Feeds/Tags results, and an ephemeral filter chip bar.

**Architecture:** New `/api/search` endpoint backed by three parallel PG queries; component-level decomposition under `components/search/`; pure snippet parser lives in `lib/search/` and translates PG `ts_headline` markers into safe `SnippetPart[]` (no HTML on the wire).

**Tech Stack:** Next.js 16 App Router (RSC + client components), Drizzle ORM, PostgreSQL `to_tsvector` / `ts_headline` / `ts_rank_cd`, Vitest, zod, React 19, Tailwind.

**Design spec:** [`docs/superpowers/specs/2026-06-02-search-palette-design.md`](../specs/2026-06-02-search-palette-design.md)

---

## Testing Strategy (project-reality alignment)

The design spec listed "Vitest + real PG" for query tests. The project has **no DB integration test infrastructure** and **no React testing infrastructure** today. Per repo convention (`tests/` is pure-function unit tests only), this plan:

- **Tests with code**: `parseSnippet` (high logic content) and the API route handler (zod, response shape, contract — via mocked query layer).
- **Does not introduce**: jsdom/RTL component tests, DB integration tests. Adding either is out of scope and would derail the slice.
- **Manual verification**: each slice ends with a manual smoke test using `pnpm dev`.

If DB integration tests become a project-wide priority later, the query functions in this plan are pure (single inputs → single Promise output) and ready for it.

---

## File Map

```
New:
  lib/search/parse-snippet.ts
  lib/db/queries/search.ts
  app/api/search/route.ts
  lib/hooks/use-search.ts
  components/search/search-snippet.tsx
  components/search/search-input.tsx
  components/search/search-results.tsx
  components/search/search-palette.tsx
  components/search/search-filter-bar.tsx      (slice 3)
  components/search/filter-dropdown.tsx        (slice 3)
  tests/search/parse-snippet.test.ts
  tests/api/search.test.ts

Modified:
  components/layout/sidebar-search.tsx         (shrunk to shell)
```

No file should exceed ~250 LOC.

---

## SLICE 1 — Backend + Snippet Parser

Independent PR. After this slice, `/api/search` works end-to-end but no UI calls it.

---

### Task 1: Pure snippet parser

**Files:**

- Create: `lib/search/parse-snippet.ts`
- Test: `tests/search/parse-snippet.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/search/parse-snippet.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseSnippet } from "@/lib/search/parse-snippet";

describe("parseSnippet", () => {
  it("returns empty array for null / undefined / empty", () => {
    expect(parseSnippet(null)).toEqual([]);
    expect(parseSnippet(undefined)).toEqual([]);
    expect(parseSnippet("")).toEqual([]);
  });

  it("returns a single text part when there is no marker", () => {
    expect(parseSnippet("hello world")).toEqual([
      { type: "text", value: "hello world" },
    ]);
  });

  it("splits a single match", () => {
    expect(parseSnippet("the ⟦async⟧ story")).toEqual([
      { type: "text", value: "the " },
      { type: "match", value: "async" },
      { type: "text", value: " story" },
    ]);
  });

  it("splits multiple matches", () => {
    expect(parseSnippet("⟦a⟧ b ⟦c⟧ d ⟦e⟧")).toEqual([
      { type: "match", value: "a" },
      { type: "text", value: " b " },
      { type: "match", value: "c" },
      { type: "text", value: " d " },
      { type: "match", value: "e" },
    ]);
  });

  it("treats an unclosed start marker as text (defensive)", () => {
    expect(parseSnippet("ok ⟦unclosed")).toEqual([
      { type: "text", value: "ok " },
      { type: "text", value: "⟦unclosed" },
    ]);
  });

  it("handles adjacent matches", () => {
    expect(parseSnippet("⟦a⟧⟦b⟧")).toEqual([
      { type: "match", value: "a" },
      { type: "match", value: "b" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test parse-snippet`
Expected: FAIL with module-not-found on `@/lib/search/parse-snippet`.

- [ ] **Step 3: Implement the parser**

Create `lib/search/parse-snippet.ts`:

```typescript
export type SnippetPart =
  | { type: "text"; value: string }
  | { type: "match"; value: string };

const START = "⟦";
const END = "⟧";

export function parseSnippet(raw: string | null | undefined): SnippetPart[] {
  if (!raw) return [];
  const parts: SnippetPart[] = [];
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf(START, i);
    if (start === -1) {
      if (i < raw.length) parts.push({ type: "text", value: raw.slice(i) });
      break;
    }
    if (start > i) parts.push({ type: "text", value: raw.slice(i, start) });
    const end = raw.indexOf(END, start + 1);
    if (end === -1) {
      parts.push({ type: "text", value: raw.slice(start) });
      break;
    }
    parts.push({ type: "match", value: raw.slice(start + 1, end) });
    i = end + 1;
  }
  return parts;
}

export const SNIPPET_START = START;
export const SNIPPET_END = END;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test parse-snippet`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/search/parse-snippet.ts tests/search/parse-snippet.test.ts
git commit -m "feat(search): pure snippet parser for ts_headline output"
```

---

### Task 2: `searchArticles` query

**Files:**

- Create: `lib/db/queries/search.ts`

- [ ] **Step 1: Scaffold the file and the article query**

Create `lib/db/queries/search.ts`:

```typescript
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  articles,
  articleTags,
  feeds,
  subscriptions,
  tags,
  userArticles,
} from "@/lib/db/schema";
import {
  parseSnippet,
  SNIPPET_START,
  SNIPPET_END,
  type SnippetPart,
} from "@/lib/search/parse-snippet";

const HEADLINE_OPTIONS_BODY = `StartSel=${SNIPPET_START}, StopSel=${SNIPPET_END}, MaxFragments=2, MaxWords=15, MinWords=5`;
const HEADLINE_OPTIONS_TITLE = `StartSel=${SNIPPET_START}, StopSel=${SNIPPET_END}, MaxFragments=1, MaxWords=20, MinWords=20`;

export interface SearchArticleOpts {
  q: string;
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  since?: Date;
  limit?: number;
}

export interface ArticleHit {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  titleParts: SnippetPart[];
  snippetParts: SnippetPart[];
  isRead: boolean;
  isStarred: boolean;
  publishedAt: Date | null;
}

export async function searchArticles(
  userId: string,
  opts: SearchArticleOpts
): Promise<ArticleHit[]> {
  const { q, feedId, folderId, tagId, unreadOnly, starredOnly, since } = opts;
  const limit = Math.min(opts.limit ?? 5, 20);

  const tsv = sql`to_tsvector('simple',
    coalesce(${articles.title}, '') || ' ' ||
    coalesce(${articles.contentText}, '') || ' ' ||
    coalesce(${articles.summary}, '') || ' ' ||
    coalesce(${articles.aiSummary}, '')
  )`;
  const tsq = sql`websearch_to_tsquery('simple', ${q})`;

  const rows = await db
    .select({
      id: articles.id,
      feedId: articles.feedId,
      feedTitle: feeds.title,
      feedIconUrl: feeds.iconUrl,
      title: articles.title,
      rawTitle: sql<string>`ts_headline('simple', coalesce(${articles.title}, ''), ${tsq}, ${HEADLINE_OPTIONS_TITLE})`,
      rawSnippet: sql<string>`ts_headline('simple', coalesce(${articles.contentText}, ${articles.summary}, ${articles.aiSummary}, ''), ${tsq}, ${HEADLINE_OPTIONS_BODY})`,
      publishedAt: articles.publishedAt,
      isRead: sql<boolean>`coalesce(${userArticles.isRead}, false)`,
      isStarred: sql<boolean>`coalesce(${userArticles.isStarred}, false)`,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId))
    )
    .leftJoin(
      userArticles,
      and(eq(userArticles.articleId, articles.id), eq(userArticles.userId, userId))
    )
    .where(
      and(
        feedId ? eq(articles.feedId, feedId) : undefined,
        folderId ? eq(subscriptions.folderId, folderId) : undefined,
        tagId
          ? sql`exists (
              select 1 from ${articleTags} at
              where at.article_id = ${articles.id} and at.tag_id = ${tagId}
            )`
          : undefined,
        unreadOnly
          ? or(isNull(userArticles.isRead), eq(userArticles.isRead, false))
          : undefined,
        starredOnly ? eq(userArticles.isStarred, true) : undefined,
        since
          ? sql`coalesce(${articles.publishedAt}, ${articles.createdAt}) >= ${since}`
          : undefined,
        sql`(${tsv} @@ ${tsq} OR ${articles.title} ILIKE ${"%" + q + "%"})`
      )
    )
    .orderBy(
      sql`ts_rank_cd(${tsv}, ${tsq}) DESC NULLS LAST, coalesce(${articles.publishedAt}, ${articles.createdAt}) DESC`
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    feedId: r.feedId,
    feedTitle: r.feedTitle,
    feedIconUrl: r.feedIconUrl,
    title: r.title,
    titleParts: parseSnippet(r.rawTitle),
    snippetParts: parseSnippet(r.rawSnippet),
    isRead: r.isRead,
    isStarred: r.isStarred,
    publishedAt: r.publishedAt,
  }));
}
```

- [ ] **Step 2: Type-check the file**

Run: `pnpm build`
Expected: build succeeds. If drizzle complains about `sql<…>` parameter binding, the most common cause is missing `${}` around a value — re-check each `sql` template literal.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/search.ts
git commit -m "feat(search): searchArticles query with snippet + rank ordering"
```

---

### Task 3: `searchFeedsByName` query

**Files:**

- Modify: `lib/db/queries/search.ts` (append)

- [ ] **Step 1: Append the feed search to `lib/db/queries/search.ts`**

Append (below `searchArticles`):

```typescript
export interface FeedHit {
  feedId: string;
  title: string | null;
  iconUrl: string | null;
  unreadCount: number;
}

export async function searchFeedsByName(
  userId: string,
  q: string,
  limit = 5
): Promise<FeedHit[]> {
  const like = "%" + q + "%";
  return db
    .select({
      feedId: feeds.id,
      title: sql<string | null>`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      iconUrl: feeds.iconUrl,
      unreadCount: sql<number>`(
        select count(*)::int from ${articles} a
        left join ${userArticles} ua
          on ua.article_id = a.id and ua.user_id = ${userId}
        where a.feed_id = ${feeds.id}
          and (ua.is_read is null or ua.is_read = false)
      )`,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(subscriptions.feedId, feeds.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        or(
          ilike(feeds.title, like),
          ilike(subscriptions.customTitle, like),
          ilike(feeds.description, like)
        )
      )
    )
    .orderBy(
      sql`(case when coalesce(${subscriptions.customTitle}, ${feeds.title}) ILIKE ${q + "%"} then 0 else 1 end), coalesce(${subscriptions.customTitle}, ${feeds.title})`
    )
    .limit(Math.min(limit, 20));
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/search.ts
git commit -m "feat(search): searchFeedsByName over user subscriptions"
```

---

### Task 4: `searchTagsByName` query

**Files:**

- Modify: `lib/db/queries/search.ts` (append)

- [ ] **Step 1: Append the tag search**

Append:

```typescript
export interface TagHit {
  id: string;
  name: string;
  color: string | null;
  articleCount: number;
}

export async function searchTagsByName(
  userId: string,
  q: string,
  limit = 5
): Promise<TagHit[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      articleCount: sql<number>`(
        select count(*)::int from ${articleTags} at
        where at.tag_id = ${tags.id}
      )`,
    })
    .from(tags)
    .where(and(eq(tags.userId, userId), ilike(tags.name, "%" + q + "%")))
    .orderBy(tags.name)
    .limit(Math.min(limit, 20));
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/search.ts
git commit -m "feat(search): searchTagsByName over user tags"
```

---

### Task 5: `/api/search` route

**Files:**

- Create: `app/api/search/route.ts`
- Create: `tests/api/search.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `tests/api/search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));
vi.mock("@/lib/db/queries/search", () => ({
  searchArticles: vi.fn(),
  searchFeedsByName: vi.fn(),
  searchTagsByName: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import {
  searchArticles,
  searchFeedsByName,
  searchTagsByName,
} from "@/lib/db/queries/search";
import { GET } from "@/app/api/search/route";

const mockSession = { user: { id: "user-1" } };

beforeEach(() => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(searchArticles).mockReset();
  vi.mocked(searchFeedsByName).mockReset();
  vi.mocked(searchTagsByName).mockReset();
});

function makeReq(qs: string): Request {
  return new Request("https://test.local/api/search?" + qs);
}

describe("GET /api/search", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Error("nope"));
    const res = await GET(makeReq("q=async"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when q is missing", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is empty after trim", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const res = await GET(makeReq("q=%20%20"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is too long", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    const res = await GET(makeReq("q=" + "a".repeat(501)));
    expect(res.status).toBe(400);
  });

  it("returns combined results on success", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    vi.mocked(searchArticles).mockResolvedValueOnce([
      {
        id: "a1",
        feedId: "f1",
        feedTitle: "Feed",
        feedIconUrl: null,
        title: "Async Rust",
        titleParts: [{ type: "text", value: "Async Rust" }],
        snippetParts: [{ type: "match", value: "async" }],
        isRead: false,
        isStarred: false,
        publishedAt: null,
      },
    ]);
    vi.mocked(searchFeedsByName).mockResolvedValueOnce([
      { feedId: "f1", title: "Async Weekly", iconUrl: null, unreadCount: 2 },
    ]);
    vi.mocked(searchTagsByName).mockResolvedValueOnce([
      { id: "t1", name: "async", color: null, articleCount: 4 },
    ]);

    const res = await GET(makeReq("q=async"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query).toBe("async");
    expect(body.data.articles).toHaveLength(1);
    expect(body.data.feeds).toHaveLength(1);
    expect(body.data.tags).toHaveLength(1);
  });

  it("isolates errors per query (failing tags → empty tags)", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce(mockSession as never);
    vi.mocked(searchArticles).mockResolvedValueOnce([]);
    vi.mocked(searchFeedsByName).mockResolvedValueOnce([]);
    vi.mocked(searchTagsByName).mockRejectedValueOnce(new Error("boom"));

    const res = await GET(makeReq("q=async"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test tests/api/search`
Expected: FAIL — `@/app/api/search/route` cannot be resolved.

- [ ] **Step 3: Implement the route**

Create `app/api/search/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import {
  searchArticles,
  searchFeedsByName,
  searchTagsByName,
} from "@/lib/db/queries/search";

const QuerySchema = z.object({
  q: z
    .string()
    .min(1, "q is required")
    .max(500, "q too long")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "q is required"),
  feedId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  tag: z.string().uuid().optional(),
  unread: z.enum(["true", "false"]).optional(),
  starred: z.enum(["true", "false"]).optional(),
  since: z
    .string()
    .datetime()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
  limit: z
    .string()
    .optional()
    .transform((s) => (s ? Math.min(parseInt(s, 10) || 5, 20) : 5)),
});

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.message },
      { status: 400 }
    );
  }

  const { q, feedId, folderId, tag, unread, starred, since, limit } = parsed.data;
  const opts = {
    q,
    feedId,
    folderId,
    tagId: tag,
    unreadOnly: unread === "true",
    starredOnly: starred === "true",
    since,
    limit,
  };

  const userId = session.user.id;
  const [articlesResult, feedsResult, tagsResult] = await Promise.allSettled([
    searchArticles(userId, opts),
    searchFeedsByName(userId, q, limit),
    searchTagsByName(userId, q, limit),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      query: q,
      articles: articlesResult.status === "fulfilled" ? articlesResult.value : [],
      feeds: feedsResult.status === "fulfilled" ? feedsResult.value : [],
      tags: tagsResult.status === "fulfilled" ? tagsResult.value : [],
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/api/search`
Expected: 5 tests pass.

- [ ] **Step 5: Type-check + full test run**

Run: `pnpm build && pnpm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 6: Manual smoke test**

Start dev server:

```bash
pnpm dev
```

In another terminal (with a logged-in session cookie copied from the browser, or via `curl` against the dev server while logged in via browser session):

```bash
curl -i 'http://localhost:3000/api/search?q=test' -b "<your-session-cookie>"
```

Expected: 200 with `{ success: true, data: { query, articles, feeds, tags } }`. Articles may be empty depending on data; the shape is what matters.

- [ ] **Step 7: Commit**

```bash
git add app/api/search/route.ts tests/api/search.test.ts
git commit -m "feat(api): GET /api/search with sectioned multi-type results"
```

**End of Slice 1.** Open PR (optional) or proceed to Slice 2.

---

## SLICE 2 — Frontend Palette (no filter bar)

Independent PR. After this slice, users see sectioned results with snippet highlighting in `⌘K`.

---

### Task 6: `useSearch` hook

**Files:**

- Create: `lib/hooks/use-search.ts`

- [ ] **Step 1: Create the hook**

Create `lib/hooks/use-search.ts`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import type { SnippetPart } from "@/lib/search/parse-snippet";

export interface ArticleHitDTO {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  titleParts: SnippetPart[];
  snippetParts: SnippetPart[];
  isRead: boolean;
  isStarred: boolean;
  publishedAt: string | null;
}

export interface FeedHitDTO {
  feedId: string;
  title: string | null;
  iconUrl: string | null;
  unreadCount: number;
}

export interface TagHitDTO {
  id: string;
  name: string;
  color: string | null;
  articleCount: number;
}

export interface SearchData {
  query: string;
  articles: ArticleHitDTO[];
  feeds: FeedHitDTO[];
  tags: TagHitDTO[];
}

export interface SearchFilters {
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unread: boolean;
  starred: boolean;
  since?: "today" | "7d" | "30d";
}

const DEBOUNCE_MS = 250;

function sinceToIso(s: SearchFilters["since"]): string | undefined {
  if (!s) return undefined;
  const now = Date.now();
  const days = s === "today" ? 1 : s === "7d" ? 7 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function useSearch(
  query: string,
  filters: SearchFilters,
  enabled: boolean
): { data: SearchData | null; loading: boolean } {
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable JSON of filters for the effect deps (object identity changes every render).
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length === 0) {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setData(null);
      setLoading(false);
      return;
    }

    const run = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      const p = new URLSearchParams({ q: trimmed });
      if (filters.feedId) p.set("feedId", filters.feedId);
      if (filters.folderId) p.set("folderId", filters.folderId);
      if (filters.tagId) p.set("tag", filters.tagId);
      if (filters.unread) p.set("unread", "true");
      if (filters.starred) p.set("starred", "true");
      const since = sinceToIso(filters.since);
      if (since) p.set("since", since);

      fetch("/api/search?" + p, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (controller.signal.aborted) return;
          if (body?.success) setData(body.data as SearchData);
        })
        .catch((err: unknown) => {
          if ((err as Error)?.name !== "AbortError") {
            // Soft-fail; no toast spam during keystrokes
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(run, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, filtersKey, enabled]);

  return { data, loading };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-search.ts
git commit -m "feat(search): useSearch hook with debounce and abort"
```

---

### Task 7: `SearchSnippet` component

**Files:**

- Create: `components/search/search-snippet.tsx`

- [ ] **Step 1: Create the component**

Create `components/search/search-snippet.tsx`:

```typescript
"use client";

import { cn } from "@/lib/utils";
import type { SnippetPart } from "@/lib/search/parse-snippet";

interface Props {
  parts: SnippetPart[];
  className?: string;
  /** When true, renders nothing if no `match` parts are present. */
  matchedOnly?: boolean;
}

export function SearchSnippet({ parts, className, matchedOnly }: Props) {
  if (parts.length === 0) return null;
  if (matchedOnly && !parts.some((p) => p.type === "match")) return null;
  return (
    <span className={cn("inline", className)}>
      {parts.map((p, i) =>
        p.type === "match" ? (
          <mark
            key={i}
            className="bg-yellow-200/60 dark:bg-yellow-500/30 text-foreground px-0.5 rounded-[2px]"
          >
            {p.value}
          </mark>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add components/search/search-snippet.tsx
git commit -m "feat(search): SearchSnippet renderer with mark highlighting"
```

---

### Task 8: `SearchInput` and `SearchResults`

**Files:**

- Create: `components/search/search-input.tsx`
- Create: `components/search/search-results.tsx`

- [ ] **Step 1: Create `SearchInput`**

Create `components/search/search-input.tsx`:

```typescript
"use client";

import { forwardRef } from "react";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const SearchInput = forwardRef<HTMLInputElement, Props>(
  function SearchInput({ value, onChange, onClear, onKeyDown }, ref) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search articles, feeds, tags…"
          autoFocus
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="size-3.5" />
          </button>
        )}
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground/80 shrink-0">
          Esc
        </kbd>
      </div>
    );
  }
);
```

- [ ] **Step 2: Create `SearchResults`**

Create `components/search/search-results.tsx`:

```typescript
"use client";

import { Loader2 } from "lucide-react";
import { cn, proxyImg } from "@/lib/utils";
import { SearchSnippet } from "./search-snippet";
import type {
  ArticleHitDTO,
  FeedHitDTO,
  TagHitDTO,
} from "@/lib/hooks/use-search";

export interface ResultsProps {
  query: string;
  loading: boolean;
  articles: ArticleHitDTO[];
  feeds: FeedHitDTO[];
  tags: TagHitDTO[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onOpenArticle: (a: ArticleHitDTO) => void;
  onOpenFeed: (f: FeedHitDTO) => void;
  onOpenTag: (t: TagHitDTO) => void;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {label}
    </div>
  );
}

function ArticleRow({
  hit,
  active,
  onActivate,
  onOpen,
}: {
  hit: ArticleHitDTO;
  active: boolean;
  onActivate: () => void;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onActivate}
        onClick={onOpen}
        className={cn(
          "w-full text-left px-3 py-2 flex gap-2.5 items-start transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
          hit.isRead && "opacity-70"
        )}
      >
        {hit.feedIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(hit.feedIconUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-4 rounded-sm shrink-0 mt-0.5"
          />
        ) : (
          <div className="size-4 rounded-sm shrink-0 mt-0.5 bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[13px] leading-snug line-clamp-2",
              !hit.isRead && "font-semibold"
            )}
          >
            {hit.titleParts.length > 0 ? (
              <SearchSnippet parts={hit.titleParts} />
            ) : (
              hit.title ?? "(no title)"
            )}
          </div>
          <SearchSnippet
            parts={hit.snippetParts}
            matchedOnly
            className="block text-[11px] text-muted-foreground/90 line-clamp-2 mt-0.5"
          />
          <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
            {hit.feedTitle ?? "Unknown feed"}
          </div>
        </div>
      </button>
    </li>
  );
}

function FeedRow({
  hit,
  active,
  onActivate,
  onOpen,
}: {
  hit: FeedHitDTO;
  active: boolean;
  onActivate: () => void;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onActivate}
        onClick={onOpen}
        className={cn(
          "w-full text-left px-3 py-1.5 flex gap-2.5 items-center transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        {hit.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(hit.iconUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-4 rounded-sm shrink-0"
          />
        ) : (
          <div className="size-4 rounded-sm shrink-0 bg-muted" />
        )}
        <span className="text-[13px] flex-1 truncate">
          {hit.title ?? "(untitled feed)"}
        </span>
        {hit.unreadCount > 0 && (
          <span className="text-[10px] text-muted-foreground/70">
            {hit.unreadCount}
          </span>
        )}
      </button>
    </li>
  );
}

function TagRow({
  hit,
  active,
  onActivate,
  onOpen,
}: {
  hit: TagHitDTO;
  active: boolean;
  onActivate: () => void;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onActivate}
        onClick={onOpen}
        className={cn(
          "w-full text-left px-3 py-1.5 flex gap-2 items-center transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: hit.color ?? "var(--muted-foreground)" }}
        />
        <span className="text-[13px] flex-1 truncate">#{hit.name}</span>
        <span className="text-[10px] text-muted-foreground/70">
          {hit.articleCount}
        </span>
      </button>
    </li>
  );
}

export function SearchResults(props: ResultsProps) {
  const { query, loading, articles, feeds, tags, activeKey } = props;

  if (query.trim().length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        Type to search articles, feeds, and tags.
      </div>
    );
  }

  const empty = articles.length === 0 && feeds.length === 0 && tags.length === 0;
  if (loading && empty) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Searching…
      </div>
    );
  }
  if (empty) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">No matches.</div>;
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto scrollbar-thin pb-1">
      {articles.length > 0 && (
        <>
          <SectionHeader label="Articles" />
          <ul role="listbox" aria-label="Articles">
            {articles.map((a) => (
              <ArticleRow
                key={a.id}
                hit={a}
                active={activeKey === "article:" + a.id}
                onActivate={() => props.onActivate("article:" + a.id)}
                onOpen={() => props.onOpenArticle(a)}
              />
            ))}
          </ul>
        </>
      )}
      {feeds.length > 0 && (
        <>
          <SectionHeader label="Feeds" />
          <ul role="listbox" aria-label="Feeds">
            {feeds.map((f) => (
              <FeedRow
                key={f.feedId}
                hit={f}
                active={activeKey === "feed:" + f.feedId}
                onActivate={() => props.onActivate("feed:" + f.feedId)}
                onOpen={() => props.onOpenFeed(f)}
              />
            ))}
          </ul>
        </>
      )}
      {tags.length > 0 && (
        <>
          <SectionHeader label="Tags" />
          <ul role="listbox" aria-label="Tags">
            {tags.map((t) => (
              <TagRow
                key={t.id}
                hit={t}
                active={activeKey === "tag:" + t.id}
                onActivate={() => props.onActivate("tag:" + t.id)}
                onOpen={() => props.onOpenTag(t)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add components/search/search-input.tsx components/search/search-results.tsx
git commit -m "feat(search): SearchInput and sectioned SearchResults"
```

---

### Task 9: `SearchPalette` container

**Files:**

- Create: `components/search/search-palette.tsx`

- [ ] **Step 1: Create the palette**

Create `components/search/search-palette.tsx`:

```typescript
"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SearchInput } from "./search-input";
import { SearchResults } from "./search-results";
import {
  useSearch,
  type ArticleHitDTO,
  type FeedHitDTO,
  type SearchFilters,
  type TagHitDTO,
} from "@/lib/hooks/use-search";

interface PaletteState {
  query: string;
  filters: SearchFilters;
  activeKey: string | null;
}

type Action =
  | { type: "set-query"; q: string }
  | { type: "clear" }
  | { type: "set-active"; key: string }
  | { type: "move-active"; dir: 1 | -1; keys: string[] };

function reducer(state: PaletteState, action: Action): PaletteState {
  switch (action.type) {
    case "set-query":
      return { ...state, query: action.q, activeKey: null };
    case "clear":
      return { ...state, query: "", activeKey: null };
    case "set-active":
      return { ...state, activeKey: action.key };
    case "move-active": {
      const { keys, dir } = action;
      if (keys.length === 0) return state;
      const idx = state.activeKey ? keys.indexOf(state.activeKey) : -1;
      const next = idx < 0 ? 0 : Math.min(keys.length - 1, Math.max(0, idx + dir));
      return { ...state, activeKey: keys[next] };
    }
  }
}

interface Props {
  initialQuery: string;
  onClose: () => void;
}

export function SearchPalette({ initialQuery, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, dispatch] = useReducer(reducer, {
    query: initialQuery,
    filters: { unread: false, starred: false },
    activeKey: null,
  });

  const { data, loading } = useSearch(state.query, state.filters, true);

  // Flat list of activeKey candidates in DOM order. Used by ↑↓.
  const flatKeys = useMemo<string[]>(() => {
    if (!data) return [];
    return [
      ...data.articles.map((a) => "article:" + a.id),
      ...data.feeds.map((f) => "feed:" + f.feedId),
      ...data.tags.map((t) => "tag:" + t.id),
    ];
  }, [data]);

  // Default activeKey to first result when results arrive.
  useEffect(() => {
    if (!state.activeKey && flatKeys.length > 0) {
      dispatch({ type: "set-active", key: flatKeys[0] });
    }
  }, [flatKeys, state.activeKey]);

  function openArticle(a: ArticleHitDTO) {
    onClose();
    const onReader = pathname === "/reader" || pathname.startsWith("/reader/");
    const target = onReader ? pathname : "/reader";
    const p = new URLSearchParams(onReader ? searchParams.toString() : "");
    p.delete("search");
    p.set("articleId", a.id);
    router.push(`${target}?${p.toString()}`);
  }

  function openFeed(f: FeedHitDTO) {
    onClose();
    const p = new URLSearchParams();
    p.set("feedId", f.feedId);
    router.push(`/reader?${p.toString()}`);
  }

  function openTag(t: TagHitDTO) {
    onClose();
    const p = new URLSearchParams();
    p.set("tag", t.id);
    router.push(`/reader?${p.toString()}`);
  }

  function commitFullSearch() {
    const q = state.query.trim();
    if (!q) return;
    onClose();
    const p = new URLSearchParams();
    p.set("search", q);
    router.push(`/reader?${p.toString()}`);
  }

  function onActivateByKey(key: string) {
    if (key.startsWith("article:") && data) {
      const id = key.slice("article:".length);
      const hit = data.articles.find((a) => a.id === id);
      if (hit) openArticle(hit);
    } else if (key.startsWith("feed:") && data) {
      const id = key.slice("feed:".length);
      const hit = data.feeds.find((f) => f.feedId === id);
      if (hit) openFeed(hit);
    } else if (key.startsWith("tag:") && data) {
      const id = key.slice("tag:".length);
      const hit = data.tags.find((t) => t.id === id);
      if (hit) openTag(hit);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      dispatch({ type: "move-active", dir: 1, keys: flatKeys });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      dispatch({ type: "move-active", dir: -1, keys: flatKeys });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) || !state.activeKey) {
        commitFullSearch();
      } else {
        onActivateByKey(state.activeKey);
      }
    }
  }

  return (
    <>
      <SearchInput
        ref={inputRef}
        value={state.query}
        onChange={(v) => dispatch({ type: "set-query", q: v })}
        onClear={() => {
          dispatch({ type: "clear" });
          inputRef.current?.focus();
        }}
        onKeyDown={onKeyDown}
      />
      <SearchResults
        query={state.query}
        loading={loading}
        articles={data?.articles ?? []}
        feeds={data?.feeds ?? []}
        tags={data?.tags ?? []}
        activeKey={state.activeKey}
        onActivate={(key) => dispatch({ type: "set-active", key })}
        onOpenArticle={openArticle}
        onOpenFeed={openFeed}
        onOpenTag={openTag}
      />
      {state.query.trim().length > 0 && data && (data.articles.length > 0 || data.feeds.length > 0 || data.tags.length > 0) && (
        <button
          type="button"
          onClick={commitFullSearch}
          className="w-full text-left px-3 py-2 text-xs font-medium border-t border-border text-primary hover:bg-primary/5 transition-colors"
        >
          See all results for &ldquo;{state.query.trim()}&rdquo; →
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add components/search/search-palette.tsx
git commit -m "feat(search): SearchPalette container with reducer-driven nav"
```

---

### Task 10: Refactor `SidebarSearch` to shell

**Files:**

- Modify: `components/layout/sidebar-search.tsx` (full rewrite to ~50 LOC)

- [ ] **Step 1: Rewrite the sidebar trigger as a thin shell**

Replace the entire content of `components/layout/sidebar-search.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SearchPalette } from "@/components/search/search-palette";

/**
 * Sidebar search trigger + ⌘K floating command palette.
 *
 * Shell-only: opens the dialog and renders SearchPalette. All search/state/
 * nav logic lives in SearchPalette and its children.
 */
export function SidebarSearch() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const initialQuery = searchParams.get("search") ?? "";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 text-sm bg-muted rounded-md pl-2.5 pr-1.5 py-1.5 border border-transparent hover:border-border transition-colors text-muted-foreground/80"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">
          {initialQuery || "Search articles…"}
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground/80">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="p-0 sm:max-w-xl w-[92vw] gap-0 top-[18%] -translate-y-0 overflow-hidden"
        >
          {open && (
            <SearchPalette initialQuery={initialQuery} onClose={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Type-check + full test run**

Run: `pnpm build && pnpm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 3: Manual smoke test**

```bash
pnpm dev
```

In browser:

1. Open the app, log in.
2. Press `⌘K` (or `Ctrl+K`). Palette opens.
3. Type "the" (or any common term). Expect ~5 articles with snippet text, plus matching feeds and tags if any.
4. `↑` / `↓` moves selection across sections.
5. Enter on a feed result → URL becomes `/reader?feedId=…`, palette closes.
6. Re-open with `⌘K`, Esc closes.
7. Confirm `<mark>` highlights are visible in light _and_ dark mode.

- [ ] **Step 4: Commit**

```bash
git add components/layout/sidebar-search.tsx
git commit -m "refactor(search): shrink SidebarSearch to trigger+dialog shell"
```

**End of Slice 2.** Open PR (optional) or proceed to Slice 3.

---

## SLICE 3 — Filter Chip Bar

Independent PR. Adds chip-bar above the input with Feed / Folder / Tag / Date dropdowns and Unread / Starred toggles. URL folds filters on commit.

---

### Task 11: Reducer extensions for filter actions

**Files:**

- Modify: `components/search/search-palette.tsx`

- [ ] **Step 1: Extend the reducer and add commit-with-filters**

In `components/search/search-palette.tsx`, replace the `Action` type and `reducer` function:

```typescript
type Action =
  | { type: "set-query"; q: string }
  | { type: "clear" }
  | { type: "set-active"; key: string }
  | { type: "move-active"; dir: 1 | -1; keys: string[] }
  | { type: "set-filter"; key: "feedId" | "folderId" | "tagId" | "since"; value: string | undefined }
  | { type: "toggle-filter"; key: "unread" | "starred" }
  | { type: "clear-filters" };

function reducer(state: PaletteState, action: Action): PaletteState {
  switch (action.type) {
    case "set-query":
      return { ...state, query: action.q, activeKey: null };
    case "clear":
      return { ...state, query: "", activeKey: null };
    case "set-active":
      return { ...state, activeKey: action.key };
    case "move-active": {
      const { keys, dir } = action;
      if (keys.length === 0) return state;
      const idx = state.activeKey ? keys.indexOf(state.activeKey) : -1;
      const next = idx < 0 ? 0 : Math.min(keys.length - 1, Math.max(0, idx + dir));
      return { ...state, activeKey: keys[next] };
    }
    case "set-filter":
      return {
        ...state,
        filters: { ...state.filters, [action.key]: action.value as never },
        activeKey: null,
      };
    case "toggle-filter": {
      // unread and starred are mutually exclusive (reader uses a single `view`).
      if (action.key === "unread") {
        const next = !state.filters.unread;
        return {
          ...state,
          filters: { ...state.filters, unread: next, starred: next ? false : state.filters.starred },
          activeKey: null,
        };
      }
      const next = !state.filters.starred;
      return {
        ...state,
        filters: { ...state.filters, starred: next, unread: next ? false : state.filters.unread },
        activeKey: null,
      };
    }
    case "clear-filters":
      return {
        ...state,
        filters: { unread: false, starred: false },
        activeKey: null,
      };
  }
}
```

And replace `commitFullSearch` to fold filters into the URL:

```typescript
  function commitFullSearch() {
    const q = state.query.trim();
    if (!q) return;
    onClose();
    const p = new URLSearchParams();
    p.set("search", q);
    if (state.filters.feedId) p.set("feedId", state.filters.feedId);
    if (state.filters.folderId) p.set("folderId", state.filters.folderId);
    if (state.filters.tagId) p.set("tag", state.filters.tagId);
    if (state.filters.starred) p.set("view", "starred");
    else if (state.filters.unread) p.set("view", "unread");
    // `since` is palette-local; reader has no since param.
    router.push(`/reader?${p.toString()}`);
  }
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success — `SearchPalette` still renders (filter bar comes in next task).

- [ ] **Step 3: Commit**

```bash
git add components/search/search-palette.tsx
git commit -m "feat(search): palette reducer filter actions + URL folding"
```

---

### Task 12: `FilterDropdown` reusable component

**Files:**

- Create: `components/search/filter-dropdown.tsx`

- [ ] **Step 1: Create the dropdown component**

Create `components/search/filter-dropdown.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  id: string;
  label: string;
}

interface Props {
  label: string;
  /** When set, shows the active option's label inside the chip. */
  activeId?: string;
  /** Lazy loader; called on first open. Returns options for the menu. */
  loadOptions: () => Promise<DropdownOption[]>;
  onSelect: (id: string | undefined) => void;
}

export function FilterDropdown({ label, activeId, loadOptions, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DropdownOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lazy-load on first open.
  useEffect(() => {
    if (!open || options !== null || loading) return;
    setLoading(true);
    loadOptions()
      .then((opts) => setOptions(opts))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [open, options, loading, loadOptions]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const active = activeId ? options?.find((o) => o.id === activeId) : undefined;
  const chipLabel = active?.label ?? label;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 h-6 rounded-full px-2 text-[11px] border transition-colors",
          activeId
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-muted border-transparent hover:border-border text-muted-foreground"
        )}
      >
        <span className="truncate max-w-[120px]">{chipLabel}</span>
        {activeId ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={"Clear " + label}
            className="hover:bg-primary/10 rounded-full p-[1px]"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(undefined);
            }}
          >
            <X className="size-3" />
          </span>
        ) : (
          <ChevronDown className="size-3" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] max-h-[40vh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
          ) : !options || options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No options.</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelect(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                  opt.id === activeId && "bg-accent"
                )}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add components/search/filter-dropdown.tsx
git commit -m "feat(search): reusable FilterDropdown with lazy options"
```

---

### Task 13: `SearchFilterBar` composition

**Files:**

- Create: `components/search/search-filter-bar.tsx`

- [ ] **Step 1: Build the filter bar**

Create `components/search/search-filter-bar.tsx`:

```typescript
"use client";

import { useCallback } from "react";
import { FilterDropdown, type DropdownOption } from "./filter-dropdown";
import { cn } from "@/lib/utils";
import type { SearchFilters } from "@/lib/hooks/use-search";

interface Props {
  filters: SearchFilters;
  onSetFilter: (
    key: "feedId" | "folderId" | "tagId" | "since",
    value: string | undefined
  ) => void;
  onToggleFilter: (key: "unread" | "starred") => void;
  onClearAll: () => void;
}

async function loadFeeds(): Promise<DropdownOption[]> {
  const res = await fetch("/api/feeds");
  if (!res.ok) return [];
  const body = await res.json();
  if (!body?.success) return [];
  type Sub = { feedId: string; title: string | null; feedTitle: string | null };
  return (body.data as Sub[])
    .map((s) => ({ id: s.feedId, label: s.title ?? s.feedTitle ?? "(untitled)" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function loadFolders(): Promise<DropdownOption[]> {
  const res = await fetch("/api/folders");
  if (!res.ok) return [];
  const body = await res.json();
  if (!body?.success) return [];
  type Folder = { id: string; name: string };
  return (body.data as Folder[])
    .map((f) => ({ id: f.id, label: f.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function loadTags(): Promise<DropdownOption[]> {
  const res = await fetch("/api/tags");
  if (!res.ok) return [];
  const body = await res.json();
  if (!body?.success) return [];
  type Tag = { id: string; name: string };
  return (body.data as Tag[])
    .map((t) => ({ id: t.id, label: "#" + t.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const SINCE_OPTIONS: DropdownOption[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Past 7 days" },
  { id: "30d", label: "Past 30 days" },
];

export function SearchFilterBar({
  filters,
  onSetFilter,
  onToggleFilter,
  onClearAll,
}: Props) {
  const loadSince = useCallback(async () => SINCE_OPTIONS, []);

  const anyActive =
    !!filters.feedId ||
    !!filters.folderId ||
    !!filters.tagId ||
    !!filters.since ||
    filters.unread ||
    filters.starred;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border">
      <FilterDropdown
        label="Feed"
        activeId={filters.feedId}
        loadOptions={loadFeeds}
        onSelect={(v) => onSetFilter("feedId", v)}
      />
      <FilterDropdown
        label="Folder"
        activeId={filters.folderId}
        loadOptions={loadFolders}
        onSelect={(v) => onSetFilter("folderId", v)}
      />
      <FilterDropdown
        label="Tag"
        activeId={filters.tagId}
        loadOptions={loadTags}
        onSelect={(v) => onSetFilter("tagId", v)}
      />
      <FilterDropdown
        label="Date"
        activeId={filters.since}
        loadOptions={loadSince}
        onSelect={(v) => onSetFilter("since", v)}
      />
      <button
        type="button"
        onClick={() => onToggleFilter("unread")}
        className={cn(
          "inline-flex items-center h-6 rounded-full px-2 text-[11px] border transition-colors",
          filters.unread
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-muted border-transparent hover:border-border text-muted-foreground"
        )}
      >
        Unread
      </button>
      <button
        type="button"
        onClick={() => onToggleFilter("starred")}
        className={cn(
          "inline-flex items-center h-6 rounded-full px-2 text-[11px] border transition-colors",
          filters.starred
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-muted border-transparent hover:border-border text-muted-foreground"
        )}
      >
        Starred
      </button>
      {anyActive && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[11px] text-muted-foreground hover:text-foreground ml-auto"
        >
          Clear
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add components/search/search-filter-bar.tsx
git commit -m "feat(search): SearchFilterBar with lazy dropdowns and toggle chips"
```

---

### Task 14: Wire the filter bar into the palette

**Files:**

- Modify: `components/search/search-palette.tsx`

- [ ] **Step 1: Import and render `SearchFilterBar` between input and results**

In `components/search/search-palette.tsx`, add the import at the top:

```typescript
import { SearchFilterBar } from "./search-filter-bar";
```

And in the JSX, insert `<SearchFilterBar …/>` between `<SearchInput …/>` and `<SearchResults …/>`:

```tsx
      <SearchInput
        ref={inputRef}
        value={state.query}
        onChange={(v) => dispatch({ type: "set-query", q: v })}
        onClear={() => {
          dispatch({ type: "clear" });
          inputRef.current?.focus();
        }}
        onKeyDown={onKeyDown}
      />
      <SearchFilterBar
        filters={state.filters}
        onSetFilter={(key, value) => dispatch({ type: "set-filter", key, value })}
        onToggleFilter={(key) => dispatch({ type: "toggle-filter", key })}
        onClearAll={() => dispatch({ type: "clear-filters" })}
      />
      <SearchResults
        // ...unchanged
      />
```

- [ ] **Step 2: Type-check + full test run**

Run: `pnpm build && pnpm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 3: Manual smoke test (slice 3 acceptance)**

```bash
pnpm dev
```

In browser:

1. `⌘K` opens palette. Chip bar visible above input.
2. Click `Feed` → dropdown lists your feeds → pick one → chip turns active. Articles section narrows to that feed only.
3. Click `×` on the chip → filter clears, results widen.
4. Toggle `Unread` → chip activates, results restricted to unread.
5. Toggle `Starred` → `Unread` automatically clears (mutual exclusivity).
6. Click `Date` → pick "Past 7 days" → results narrow.
7. Click `Clear` → all chips reset.
8. With chips active, click "See all results for …" → URL has `search`, `feedId`, `view=starred` (etc.) — verify by inspecting the address bar.
9. Esc closes; reopen with `⌘K` → chip state is fresh (ephemeral).

- [ ] **Step 4: Commit**

```bash
git add components/search/search-palette.tsx
git commit -m "feat(search): wire filter bar into palette"
```

**End of Slice 3.**

---

## Final Verification

- [ ] **Step 1: Full type-check + tests + build**

Run:

```bash
pnpm build && pnpm test
```

Expected: everything green.

- [ ] **Step 2: Full acceptance checklist (from spec §10)**

Run `pnpm dev` and walk through:

- [ ] Type "async" → snippet with `<mark>` on matches
- [ ] Feeds section lists subscribed feeds matching "async"
- [ ] Tags section lists user's tags matching "async"
- [ ] ↑↓ moves cursor across section boundaries
- [ ] Enter on a feed result → URL becomes `/reader?feedId=…`, palette closes
- [ ] Add `[Feed: …]` chip → Articles section narrows to that feed
- [ ] "See all results" → URL has `search`, `feedId`, `tag`, `view=unread/starred` as appropriate
- [ ] Esc closes; reopening starts fresh (chips discarded)
- [ ] Highlight visible in light _and_ dark mode

- [ ] **Step 3: Final commit if any cleanup was needed**

If the manual run surfaced typos or small bugs not caught by the type checker, fix them and commit:

```bash
git add -p
git commit -m "fix(search): <specific issue>"
```

---

## Spec Coverage Check

| Spec section                         | Covered by                                                   |
| ------------------------------------ | ------------------------------------------------------------ |
| §1 Goal & Boundaries                 | Whole plan (in/out of scope honored)                         |
| §2 File Layout                       | "File Map" + tasks 1, 2, 5, 6, 7, 8, 9, 10, 12, 13           |
| §3 API Contract                      | Tasks 5 (route + zod), 6 (DTOs match)                        |
| §4 Query Layer                       | Tasks 2, 3, 4                                                |
| §5 Snippet Parser                    | Task 1                                                       |
| §6 Frontend Composition              | Tasks 6, 7, 8, 9, 10, 12, 13, 14                             |
| §6 State machine (reducer)           | Tasks 9, 11                                                  |
| §6 Lazy dropdown options             | Tasks 12, 13                                                 |
| §6 Snippet rendering                 | Task 7                                                       |
| §6 Keyboard & mouse map              | Tasks 8 (mouse), 9 (keys)                                    |
| §6 URL folding on commit             | Task 11                                                      |
| §6 Mutual exclusivity unread/starred | Task 11 reducer                                              |
| §7 Phasing                           | Three explicit slice sections                                |
| §8 Testing (project-reality aligned) | Task 1 unit tests + Task 5 route tests; documented deviation |
| §9 Risks                             | Acknowledged in "Testing Strategy" preamble                  |
| §10 Verification Checklist           | "Final Verification"                                         |
