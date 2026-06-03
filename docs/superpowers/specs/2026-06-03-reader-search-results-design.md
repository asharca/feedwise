# Reader Search Results Page — Design

**Date:** 2026-06-03
**Status:** Draft (pending review)
**Scope:** Reshape `app/(reader)/reader/page.tsx` when `?search=...` is present so the full-page results mirror the `⌘K` SearchPalette (sectioned Articles / Feeds / Tags with snippet highlighting, shared Filter bar).

---

## 1. Goal & Boundaries

The `⌘K` palette and the reader search results page currently diverge:

| | Palette (`SearchPalette`) | Reader page (`/reader?search=...`) |
|---|---|---|
| Data | `GET /api/search` (FTS + `ts_headline` snippets) | `GET /api/articles?search=` (FTS + ILIKE fallback, no snippets) |
| Sections | Articles / Feeds / Tags | Articles only |
| Highlighting | `<mark>` over title + body snippet fragments | whole-word `<mark>` on title and stripped summary |
| Filter bar | yes (feed / folder / tag / unread / starred / since) | no |
| Sort | `ts_rank_cd` | `publishedAt desc` |

The two surfaces share a query and a mental model, but render and rank differently. Pressing **Enter** in the palette jumps to the page and the user sees a visually and informationally different result set — confusing.

**In scope**
- Detect `?search=...` in `app/(reader)/reader/page.tsx` and route rendering through a new `ReaderSearchResults` layout.
- Reuse the same `/api/search` endpoint and `useSearch` hook (and the same zod schema) so palette and page can never disagree on the data shape.
- Reuse `SearchFilterBar`, `SearchSnippet`, and the section header styling from `components/search/` to eliminate the duplication that allowed drift.
- Filter chips, sort, and pagination behaviour carried over as-is (palette uses top-20 only; page uses top-50 + offset for Articles, top-20 for Feeds/Tags).
- Clicking an article sets `?articleId=...` (preserves the existing reader drawer on the right), same as today.

**Out of scope**
- Redesigning the dashboard, tag view, feed view, or starred view.
- Reordering the default list view when `?search=` is absent.
- Changing the `useSearch` debounce timing (it stays palette-tuned at 250ms; the page fetches once on mount and on filter change).
- A separate "AI search" mode (`components/ai-search-dialog.tsx`) — kept untouched.
- Schema changes. `to_tsvector` + GIN index follow-up already documented in the palette spec.

**Module boundaries** (per `AGENTS.md`)
- `lib/db/queries/search.ts` and `app/api/search/route.ts` — unchanged.
- `components/search/*` — exports reused by the new page; no API changes.
- New `app/(reader)/reader/_search-view/` colocated folder for the page-specific components (single-purpose, no cross-route imports).
- `app/(reader)/reader/page.tsx` — branches at the top: if `search` param is present, render the new search view; otherwise render the existing two-pane reader.

---

## 2. Layout

Single-column flow with a right-side rail, scoped to the `/reader` route's existing two-pane container. Mobile collapses the rail under the article list.

```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar (existing)  │  Reader main column                  │
│                      │  ┌────────────────────────────────┐  │
│                      │  │ Top bar:                       │  │
│                      │  │  "Search: <q>"  ·  N results   │  │
│                      │  │  Filter chips: [feed] [tag]..  │  │
│                      │  ├────────────────────────────────┤  │
│                      │  │ Section: Articles (top-50,     │  │
│                      │  │  ts_rank_cd order, infinite)   │  │
│                      │  │  ┌──────────────────────────┐  │  │
│                      │  │  │ feed icon · feed name    │  │  │
│                      │  │  │ Title with <mark>        │  │  │
│                      │  │  │ Snippet with <mark>      │  │  │
│                      │  │  │ date                     │  │  │
│                      │  │  └──────────────────────────┘  │  │
│                      │  │  ...rows...                    │  │
│                      │  ├────────────────────────────────┤  │
│                      │  │ Section: Feeds (top-20)        │  │
│                      │  │ Section: Tags  (top-20)        │  │
│                      │  └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

When the user clicks an article, the right-hand reader drawer (existing `ArticleReader` mounted in the same route) slides in, the search view stays mounted on the left — the URL gains `&articleId=...` and the filter/search params are preserved so going back returns to the exact filtered list.

**Empty / no-articles states**
- No matches at all → centred `Search` icon + `"No matches for "<q>""` + button to clear filters.
- Articles empty but Feeds/Tags have hits → `ArticleList` empty slot, but the page-level empty state is suppressed in favour of a sub-card under the Articles section: "No articles matched. N feeds and M tags did — see below." This is the answer to the earlier "no-articles-but-hits" clarification.

**Mobile (<md)**
- Top bar collapses: search query + result count only, no filter bar inline (filter bar moves into a `<details>` drawer triggered by a `Filter` icon button, matching the palette's modal feel without leaving the page).
- Feeds and Tags sections render as horizontal-scroll chip rows.

---

## 3. File Layout

```
app/(reader)/reader/
  page.tsx                                       [modified] branch on search param
  _search-view/
    search-results-page.tsx                      [new] main layout
    search-results-topbar.tsx                    [new] title + filter bar + counts
    search-results-articles.tsx                  [new] infinite-scroll article list
    search-results-side-rail.tsx                 [new] Feeds + Tags sections
    search-results-empty.tsx                     [new] empty/no-article states
    use-page-search.ts                           [new] hook: page-scoped fetch + filter state

components/search/                                [unchanged exports reused]
  search-filter-bar.tsx                          reused
  search-snippet.tsx                             reused
  search-results.tsx                             unchanged (palette only)

lib/hooks/use-search.ts                          unchanged
```

`_search-view/` is a private folder (Next.js App Router ignores folders prefixed with `_`). Each file stays under ~200 LOC.

---

## 4. Data Flow

```
URL: /reader?search=商业体&feedId=<uuid>&view=unread
   │
   ▼
ReaderContent (page.tsx)
   │ const search = searchParams.get("search") ?? undefined;
   │ if (search) → render <SearchResultsPage initial={...} />
   │ else        → existing two-pane reader
   ▼
usePageSearch(query, filters)
   │ wraps useSearch() + adds filter state synced to URL
   │ debounce 250ms (matches palette)
   ▼
GET /api/search?q=...&feedId=...&tag=...&unread=true&since=2026-05-25
   │
   ▼
SearchResultsPage
   ├─ <TopBar query result count + <SearchFilterBar />>
   ├─ <ArticlesSection articles={...} onSelect=...>
   │     on scroll-end → fetch /api/articles?search=...&offset=50   (existing pagination)
   │     on select      → router.replace(/reader?search=...&articleId=...)
   ├─ <SideRail feeds tags />
   └─ <EmptyState /> (only if data === null OR total === 0 with no Feeds/Tags hits)
```

**Why two endpoints?**
- `/api/search` returns top-20 per section with `ts_headline` snippets, ranked by `ts_rank_cd`. Drives the top of every section.
- `/api/articles?search=...` returns top-50 offset-paginated, ranked by `publishedAt desc`. Drives the infinite-scroll article list. This matches today's reader behaviour (chronological) and preserves the existing `/api/articles` test surface.

Both endpoints share the same `q` param and the same FTS + ILIKE fallback, so a hit appears in both — and the article list's chronological tail extends beyond the top-20 relevance list.

**State sync**
- `usePageSearch` reads filters from `useSearchParams` on mount, writes them back via `router.replace` on change (no scroll, no flash).
- `?search=` itself is preserved across navigation. If the user navigates from palette to `/reader?search=foo`, the page picks up `foo` as `initial`.

---

## 5. Components

### `usePageSearch`
- Mirrors the palette's filter model (`SearchFilters` from `use-search.ts`).
- Returns `{ data, loading, filters, setFilter, toggleFilter, clearFilters }`.
- Watches `q` and `filtersKey` (matches `useSearch` internals) and re-fetches on change.
- `q` is read-only after mount; the page doesn't expose a search input inside itself (typing lives in the palette, which is the canonical entry point). Pressing ⌘K reopens the palette with the current `q` pre-filled (existing behaviour via `initialQuery`).

### `SearchResultsPage`
- Owns the top bar and the two-column body.
- Top bar shows: `<h1>` "Search: <q>", result counts per section, and the `SearchFilterBar`.
- Body is a CSS grid: `grid-cols-[1fr_18rem] gap-4 p-4 overflow-y-auto`. Below `md`: single column, rail under articles.

### `SearchResultsTopbar`
- Title and counts. Counts come from `data.articles.length`, `data.feeds.length`, `data.tags.length` of the `/api/search` response, plus the article list's known total (from a `HEAD` request or just a placeholder "+ more" when `articles.length >= 20`).

### `SearchResultsArticles`
- Renders article hits from `data.articles` (the first 20 from `/api/search`, with snippets) followed by the older chronological list from `/api/articles` (deduped by `id` against the top-20).
- Click → `router.replace(/reader?search=...&articleId=...)` (existing `openArticle` in `page.tsx`).
- Star/inline actions from the existing `handleStar` and `handleMarkRead` callbacks.

### `SearchResultsSideRail`
- Renders Feeds section then Tags section. Each section caps at 20 (matches API).
- Feed row: click → `router.replace(/reader?feedId=<feedId>)`.
- Tag row: click → `router.replace(/reader?tag=<id>)`.

### `SearchResultsEmpty`
- Three branches:
  1. `data` null and `loading` → spinner ("Searching…").
  2. `data` populated, all three lists empty → `Search` icon + "No matches for "<q>"" + `Clear filters` button.
  3. `articles` empty, `feeds` or `tags` non-empty → inline "no articles" card under the empty Articles slot, with the actual Feeds/Tags lists still rendered below.

---

## 6. Error Handling

- `/api/search` returns 200 with empty arrays on backend errors (existing `Promise.allSettled` behaviour). The page treats that as a successful but empty response, matching the palette.
- `/api/search` 4xx (e.g. `q` missing) is impossible on this page because the page only mounts when `?search=` is non-empty, but the hook's existing error path (`body?.success === false`) is reused.
- `/api/articles` infinite-scroll errors → log and stop paginating; the top-20 from `/api/search` is still shown.
- Network down → the empty state renders the same shell with a "Couldn't reach the search service" message and a `Retry` button that re-fetches.

---

## 7. Testing

- New `tests/api/articles-search.test.ts` already covers the list endpoint; not changed.
- New `tests/_search-view/use-page-search.test.ts` (vitest + Testing Library) for the hook: filter → URL roundtrip, debounce, abort on unmount.
- The existing `tests/api/search.test.ts` and `tests/db/search-headline-options.test.ts` cover `/api/search` and the constant invariants — unchanged.
- Manual checklist (added to `docs/superpowers/manual-tests/`):
  - Empty `?search=foo` with no subscriptions → empty state.
  - `?search=foo` with one feed and zero article hits → "no articles but 1 feed" inline card.
  - `?search=商业体` (CJK) → snippets render with `<mark>`.
  - Open palette, set `unread=true` chip, press Enter → page opens with the filter chip active and the URL updated.
  - Click an article → reader drawer opens; `?search=foo&articleId=...` in URL; back returns to filtered list.
  - Scroll articles to the bottom → older chronological results append.

---

## 8. Out-of-scope follow-ups (not part of this design)

- GIN index on `to_tsvector(coalesce(title,'') || ' ' || coalesce(content_text,'') || ...)` for faster FTS.
- Personalised snippet tuning (e.g. MinWords/MaxWords per body length).
- Cross-field search (`q='feed:foo OR tag:bar'`).
- Search history / saved searches.
- A unified palette/page test harness that snapshots both surfaces against the same fixture.
