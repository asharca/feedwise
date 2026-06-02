# Search Palette Enhancements — Design

**Date:** 2026-06-02
**Status:** Draft (pending review)
**Scope:** Sidebar `⌘K` command palette upgrade — multi-type search (articles + feeds + tags), snippet highlighting, ephemeral filter chip bar.

---

## 1. Goal & Boundaries

Upgrade the `⌘K` palette from "title-only article search" into a unified finder.

**In scope**
- Full-text snippet over title + body + summary + AI summary, with `<mark>` highlighting
- Sectioned results: **Articles / Feeds / Tags** (5 per section)
- Ephemeral filter chip bar above the input: Feed / Folder / Tag / Date / Unread / Starred
- Single new endpoint `GET /api/search` returning all three result types
- Component decomposition so no single file exceeds ~200 LOC

**Out of scope**
- Modifying `app/(reader)/reader/page.tsx`. The reader list keeps using `/api/articles?search=` and keeps publishedAt ordering (list semantics, not search semantics).
- Modifying `getArticles()` in `lib/db/queries/articles.ts`.
- Schema migrations. The optional GIN index is documented as a follow-up.
- New search engines (Meilisearch / Typesense). PG `to_tsvector` is sufficient.

**Module boundaries** (per `AGENTS.md`)
- `lib/db/queries/search.ts` depends only on drizzle + schema. No Next.js imports.
- `app/api/search/route.ts` is a thin wrapper over the query layer.
- All UI in `components/search/`.

---

## 2. File Layout

```
lib/db/queries/search.ts           [new] multi-type search queries
lib/search/parse-snippet.ts        [new] pure snippet parser
app/api/search/route.ts            [new] thin API route, zod-validated
lib/hooks/use-search.ts            [new] debounced + aborted fetch hook
components/search/
  search-palette.tsx               [new] palette body, owns reducer state
  search-filter-bar.tsx            [new] chip + dropdown row
  search-results.tsx               [new] sectioned result renderer
  search-snippet.tsx               [new] SnippetPart[] → JSX
  search-input.tsx                 [new] controlled input + keyboard handler
components/layout/sidebar-search.tsx [edit] shrunk to trigger + Dialog shell + ⌘K listener
```

No deletions. No file should exceed ~200 LOC.

---

## 3. API Contract

`GET /api/search`

| Param | Type | Notes |
|---|---|---|
| `q` | string (required) | Trimmed both sides. Empty → 400. |
| `feedId` | uuid | |
| `folderId` | uuid | |
| `tag` | uuid | |
| `unread` | `"true"` | |
| `starred` | `"true"` | |
| `since` | ISO datetime | |
| `limit` | number | Per-section cap. Default 5, clamped to 20. |

Validated with a zod schema; invalid params → 400.

**Response**

```ts
{
  success: true,
  data: {
    query: string,
    articles: Array<{
      id: string,
      feedId: string,
      feedTitle: string | null,
      feedIconUrl: string | null,
      title: string | null,
      titleParts: SnippetPart[],
      snippetParts: SnippetPart[],
      isRead: boolean,
      isStarred: boolean,
      publishedAt: string | null,
    }>,
    feeds: Array<{
      feedId: string,
      title: string | null,
      iconUrl: string | null,
      unreadCount: number,
    }>,
    tags: Array<{
      id: string,
      name: string,
      color: string | null,
      articleCount: number,
    }>,
  },
}
```

**Snippet wire format**

```ts
export type SnippetPart =
  | { type: 'text', value: string }
  | { type: 'match', value: string };
```

PG `ts_headline` is configured with `StartSel=⟦, StopSel=⟧` (U+27E6 / U+27E7). The server parses the marked string into `SnippetPart[]` **before** sending to the client. The wire contains no HTML, so the frontend uses no `dangerouslySetInnerHTML` and has no XSS surface from snippet content.

**Server-side execution**

```ts
const [articles, feeds, tags] = await Promise.all([
  searchArticles(userId, opts),
  searchFeedsByName(userId, q, 5),
  searchTagsByName(userId, q, 5),
]);
```

Errors are isolated per query: a failing `searchTagsByName` yields `tags: []`, not a 500.

---

## 4. Query Layer (`lib/db/queries/search.ts`)

### `searchArticles(userId, opts): Promise<ArticleHit[]>`

```ts
export interface SearchArticleOpts {
  q: string;                 // non-empty (caller guarantees)
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  since?: Date;
  limit?: number;            // default 5, clamped to 20
}
```

Same join shape as `getArticles` (articles ⋈ feeds ⋈ subscriptions ⟕ userArticles) **plus**:

```sql
SELECT …,
  ts_headline('simple',
    coalesce(content_text, summary, ai_summary, ''),
    websearch_to_tsquery('simple', $q),
    'StartSel=⟦, StopSel=⟧, MaxFragments=2, MaxWords=15, MinWords=5'
  ) AS raw_snippet,
  ts_headline('simple',
    coalesce(title, ''),
    websearch_to_tsquery('simple', $q),
    'StartSel=⟦, StopSel=⟧, MaxFragments=1, MaxWords=20, MinWords=20'
  ) AS raw_title,
  ts_rank_cd(<tsv>, websearch_to_tsquery('simple', $q)) AS rank
FROM …
WHERE …
  AND (
    <tsv> @@ websearch_to_tsquery('simple', $q)
    OR title ILIKE '%' || $q || '%'
  )
ORDER BY ts_rank_cd(<tsv>, websearch_to_tsquery('simple', $q)) DESC NULLS LAST,
         coalesce(published_at, created_at) DESC
LIMIT $limit
```

The Node side maps `rawSnippet`/`rawTitle` through `parseSnippet()` before returning. Marker strings never cross the API boundary.

### `searchFeedsByName(userId, q, limit): Promise<FeedHit[]>`

Searches the user's **subscribed** feeds (not the global feeds table):
- `feeds.title ILIKE '%q%'`, or
- `subscriptions.customTitle ILIKE '%q%'` (user's renamed title), or
- `feeds.description ILIKE '%q%'`

Orders title-prefix matches first, then alphabetical. Includes `unreadCount` like `getSubscriptions` does.

### `searchTagsByName(userId, q, limit): Promise<TagHit[]>`

```sql
SELECT id, name, color,
  (SELECT count(*)::int FROM article_tags at WHERE at.tag_id = tags.id) AS article_count
FROM tags
WHERE user_id = $userId AND name ILIKE '%' || $q || '%'
ORDER BY name
LIMIT $limit
```

---

## 5. Snippet Parser (`lib/search/parse-snippet.ts`)

Pure function. Lives in `lib/search/`, not `lib/db/`, because it's used by the server *and* could be used by the client in the future.

```ts
export type SnippetPart =
  | { type: 'text', value: string }
  | { type: 'match', value: string };

const START = '⟦';
const END = '⟧';

export function parseSnippet(raw: string | null | undefined): SnippetPart[] {
  if (!raw) return [];
  const parts: SnippetPart[] = [];
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf(START, i);
    if (start === -1) {
      if (i < raw.length) parts.push({ type: 'text', value: raw.slice(i) });
      break;
    }
    if (start > i) parts.push({ type: 'text', value: raw.slice(i, start) });
    const end = raw.indexOf(END, start + 1);
    if (end === -1) {
      // unclosed marker — treat the rest as text (defensive)
      parts.push({ type: 'text', value: raw.slice(start) });
      break;
    }
    parts.push({ type: 'match', value: raw.slice(start + 1, end) });
    i = end + 1;
  }
  return parts;
}
```

Tested cases: empty, no match, single match, multi match, unclosed marker, marker chars in plain text (documented as ~zero-probability collision due to obscure code points).

---

## 6. Frontend Composition

### Component tree

```
SidebarSearch                   trigger + Dialog + ⌘K listener
└── SearchPalette               owns useReducer state
    ├── SearchInput             controlled, owns keyboard map
    ├── SearchFilterBar         chip + dropdown row
    │   ├── FilterDropdown      reused for feed / folder / tag
    │   ├── DateMenu            today / 7d / 30d / all
    │   └── ToggleChip × 2      unread, starred
    ├── SearchResults
    │   ├── ResultSection       reused × 3
    │   ├── ArticleItem         uses SearchSnippet
    │   ├── FeedItem
    │   └── TagItem
    ├── SearchSnippet           SnippetPart[] → JSX with <mark>
    └── SearchFooter            "See all results for …"
```

### State machine

`useReducer` in `SearchPalette`:

```ts
interface PaletteState {
  query: string;
  filters: {
    feedId?: string;
    folderId?: string;
    tagId?: string;
    unread: boolean;
    starred: boolean;
    since?: 'today' | '7d' | '30d';
  };
  results: SearchResponseData | null;
  loading: boolean;
  activeKey: string | null;   // "article:<uuid>" | "feed:<uuid>" | "tag:<uuid>"
}
```

`activeKey` uses `<type>:<id>` so the cursor can flow across sections in DOM order (↑↓ from last article into first feed without an index reset).

### `useSearch` hook

`lib/hooks/use-search.ts` owns the network concerns:
- 250 ms debounce on query changes
- Filter changes trigger an **immediate** refetch (discrete, not typed)
- AbortController on every new request
- `enabled = false` when the palette is closed → no fetches

The component reads `{ data, loading }`. Race conditions are not its problem.

### Lazy dropdown options

Filter dropdowns fetch options on first open and cache for the palette session:
- Feed dropdown → `/api/feeds/subscriptions` (or whichever route returns the user's subscriptions; add a thin route if none exists today — verified during slice 3)
- Folder dropdown → `/api/folders` (verify existence; add thin route if missing)
- Tag dropdown → `/api/tags` (verified to exist)

Closing the palette discards the cache. Reopening refetches — acceptable cost.

### Snippet rendering (`SearchSnippet`)

```tsx
export function SearchSnippet({ parts, className }: Props) {
  if (parts.length === 0) return null;
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === 'match'
          ? <mark key={i} className="bg-yellow-200/60 text-foreground px-0.5 rounded-[2px]">{p.value}</mark>
          : <span key={i}>{p.value}</span>
      )}
    </span>
  );
}
```

No HTML strings. No sanitization. No XSS surface.

### Keyboard & mouse map

| Input | Action |
|---|---|
| ⌘K / Ctrl+K | Toggle palette |
| Esc | Close, discard chip state |
| ↑ / ↓ | Move `activeKey` across sections in DOM order |
| Enter | Trigger default action for `activeKey` |
| ⌘+Enter | Force "See all results", regardless of selection |
| Tab | Move focus from input into filter chip row |
| Mouse hover over result | Set `activeKey` (matches current behavior) |
| Click on result | Trigger that result's default action |

Default action per result type:
- Article → open article (current `openHit` behavior)
- Feed → `router.push('/reader?feedId=…')`, drops `search`
- Tag → `router.push('/reader?tag=…')`, drops `search`

### URL folding on commit

```ts
function commitFullSearch() {
  const p = new URLSearchParams();
  p.set('search', state.query);
  if (state.filters.feedId)   p.set('feedId', state.filters.feedId);
  if (state.filters.folderId) p.set('folderId', state.filters.folderId);
  if (state.filters.tagId)    p.set('tag', state.filters.tagId);
  // unread/starred map to `view` (reader uses a single `view` param). Mutually
  // exclusive in the UI: toggling one clears the other.
  if (state.filters.starred)      p.set('view', 'starred');
  else if (state.filters.unread)  p.set('view', 'unread');
  // `since` is local-only (reader has no since param today)
  router.push(`/reader?${p}`);
  close();
}
```

**Mutual exclusivity of unread/starred chips**: the reader honors a single `view` value (`all | unread | starred`), so the palette enforces the same: toggling starred clears unread and vice versa. The reducer handles this in the `toggle-filter` action.

Filters only mutate the URL on explicit commit, not on every keystroke.

---

## 7. Phasing

Three independently shippable PRs.

**Slice 1 — Backend + snippet**
- `lib/db/queries/search.ts`
- `lib/search/parse-snippet.ts` + unit tests
- `app/api/search/route.ts` + zod
- Integration tests (real PG)

No UI calls `/api/search` yet. Zero user-visible risk.

**Slice 2 — Frontend palette refactor (no filter bar)**
- `components/search/` new files
- `lib/hooks/use-search.ts`
- `components/layout/sidebar-search.tsx` shrunk to shell
- Sections + snippet highlighting live

User-visible delta: snippets, feed/tag results, sectioned layout. No filters yet, but no regression vs. today's palette.

**Slice 3 — Filter chip bar**
- `search-filter-bar.tsx` + dropdowns
- `/api/feeds/subscriptions` (if not present)
- URL folding on commit
- Tests for chip ↔ URL round-trip

Each slice ships on its own. If slice 3 UX needs iteration, it doesn't block slices 1–2.

---

## 8. Testing

| Layer | What | Tooling |
|---|---|---|
| `parseSnippet` | empty / no-match / single / multi / unclosed | Vitest unit |
| `searchArticles` | rank ordering, filter intersection, user isolation, ILIKE fallback | Vitest + real PG |
| `searchFeedsByName` | subscribed-only, `customTitle` match, user isolation | Vitest + real PG |
| `searchTagsByName` | user-scoped, ILIKE case-insensitive | Vitest + real PG |
| `/api/search` route | zod 400, 401 unauth, Promise.all isolation | Vitest |
| `SearchSnippet` | parts → JSX, empty returns null | React Testing Library |
| `useSearch` | debounce, abort race, disabled = no fetch | Vitest + fake timers |
| Keyboard nav | ↑↓ across sections, Enter defaults, ⌘+Enter force commit | RTL |
| URL folding | filter state → URLSearchParams | Unit |

**Not tested**: visual styling (snippet color, chip spacing), `ts_headline` itself (trust Postgres).

---

## 9. Risks & Accepted Compromises

1. **No GIN index on the search tsvector.** Current query is a sequential scan per request. Fine for typical RSS volumes (single user < 50k articles). Follow-up: migration `CREATE INDEX articles_fts_idx ON articles USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_text,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(ai_summary,'')))`. Not in scope to avoid migration coupling.

2. **Marker character collision.** Articles legitimately containing `⟦` or `⟧` (U+27E6 / U+27E7, mathematical brackets) would be mis-parsed. Probability is effectively zero; the parser has unclosed-marker fallback regardless.

3. **`ts_headline` cost.** Roughly 1 ms per article on long bodies. Capped at 5 per request → negligible.

4. **Large dropdown lists.** A user with 500 feeds gets a slow dropdown. Mitigation deferred: add type-to-filter inside the dropdown when needed.

5. **`/api/articles?search=` unchanged.** Reader list still sorts by `publishedAt`, not relevance. This is intentional: a list view is a *browse* surface, not a *find* surface. If product disagrees later, separate ticket.

6. **`since` filter is palette-local.** Reader page has no `since` URL param today. The Date chip applies in the palette query; on "See all results" it's not folded into the URL because the reader can't honor it. Acceptable: the dominant use of Date is narrowing the palette preview.

---

## 10. Verification Checklist

- `pnpm test` passes (new tests + no regressions)
- `pnpm build` passes
- Manual:
  - Type "async" → snippet appears with `<mark>` on matches
  - Feeds section lists subscribed feeds whose title/customTitle/description contains "async"
  - Tags section lists user's tags containing "async"
  - ↑↓ moves cursor across section boundaries cleanly
  - Enter on a feed result → URL becomes `/reader?feedId=…`, palette closes
  - Add chip `[Feed: Hacker News]` → Articles section narrows to that feed
  - "See all results" → URL has `search`, `feedId`, `tag`, `view=unread` etc. as appropriate
  - Esc closes; reopening starts fresh (chips discarded)
