"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Rss, Hash } from "lucide-react";
import { ArticleList } from "@/components/article/article-list";
import { SearchFilterBar } from "@/components/search/search-filter-bar";
import { SearchSnippet } from "@/components/search/search-snippet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Article } from "./types";
import { usePageSearch } from "./use-page-search";
import { cn } from "@/lib/utils";

interface Props {
  search: string;
  activeArticle: Article | null;
  onSelect: (id: string) => void;
  onStar: (id: string, starred: boolean) => void;
  articleList: Article[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/**
 * Search-results layout for `/reader?search=...`. Mirrors the ⌘K palette
 * (Feeds + Tags + Articles sections) and stacks them vertically inside a
 * single scroll column, so the user can browse the chronological article
 * tail alongside the relevance top-20 from `/api/search`.
 *
 * The right-side reader drawer (`activeArticle` panel) is mounted by the
 * parent (`ReaderContent`); this component only owns the left/search pane.
 */
export function SearchResultsPage({
  search,
  activeArticle,
  onSelect,
  onStar,
  articleList,
  hasMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading, filters, setFilter, toggleFilter, clearFilters } = usePageSearch(search);

  const articleCount = data?.articles.length ?? 0;
  const feedCount = data?.feeds.length ?? 0;
  const tagCount = data?.tags.length ?? 0;
  const hasAnyHit = articleCount + feedCount + tagCount > 0;

  const navigateToFeed = useCallback(
    (feedId: string) => {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("search");
      p.set("feedId", feedId);
      router.replace(`/reader?${p.toString()}`);
    },
    [router, searchParams]
  );

  const navigateToTag = useCallback(
    (tagId: string) => {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("search");
      p.set("tag", tagId);
      router.replace(`/reader?${p.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-col border-r border-border bg-background shrink-0 md:w-[28rem] h-full">
      <div className="px-3 h-11 flex items-center gap-2 shrink-0 border-b border-border">
        <SidebarTrigger className="md:hidden" />
        <h2 className="text-sm font-semibold tracking-tight truncate">
          Search: <span className="text-foreground/80">&ldquo;{search}&rdquo;</span>
        </h2>
      </div>
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border flex items-center gap-3">
        <span>{articleCount} articles</span>
        <span>·</span>
        <span>{feedCount} feeds</span>
        <span>·</span>
        <span>{tagCount} tags</span>
      </div>
      <SearchFilterBar
        filters={filters}
        onSetFilter={(key, value) => setFilter(key, value)}
        onToggleFilter={toggleFilter}
        onClearAll={clearFilters}
      />
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {loading && !data ? (
          <CenterHint>Searching…</CenterHint>
        ) : !hasAnyHit ? (
          <CenterHint>
            <Search className="size-5 text-muted-foreground/40" />
            <p className="text-sm">No matches for &ldquo;{search}&rdquo;</p>
            {(filters.feedId || filters.folderId || filters.tagId || filters.since || filters.unread || filters.starred) && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </CenterHint>
        ) : (
          <div className="flex flex-col">
            {/* Feeds — above Articles, only shown when there are hits. */}
            <RailSection label="Feeds" count={feedCount} empty={!loading && feedCount === 0}>
              {data?.feeds.map((f) => (
                <button
                  key={f.feedId}
                  type="button"
                  onClick={() => navigateToFeed(f.feedId)}
                  className="w-full flex items-center gap-2 py-1.5 px-3 rounded-none hover:bg-accent/50 text-sm text-left transition-colors border-b border-border/50"
                >
                  {f.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.iconUrl} alt="" className="size-4 rounded-sm shrink-0" />
                  ) : (
                    <Rss className="size-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="flex-1 truncate">{f.title ?? "(untitled feed)"}</span>
                  {f.unreadCount > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">
                      {f.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </RailSection>

            {/* Tags — above Articles, only shown when there are hits. */}
            <RailSection label="Tags" count={tagCount} empty={!loading && tagCount === 0}>
              {data?.tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigateToTag(t.id)}
                  className="w-full flex items-center gap-2 py-1.5 px-3 rounded-none hover:bg-accent/50 text-sm text-left transition-colors border-b border-border/50"
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color ?? "var(--muted-foreground)" }}
                  />
                  <Hash className="size-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-[10px] text-muted-foreground/70 shrink-0">
                    {t.articleCount}
                  </span>
                </button>
              ))}
            </RailSection>

            {/* Inline hint when no top-20 hits but feeds/tags do */}
            {data && data.articles.length === 0 && (data.feeds.length > 0 || data.tags.length > 0) && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground/80 border-b border-border/50">
                No articles matched. {data.feeds.length + data.tags.length} feed/tag
                match{data.feeds.length + data.tags.length === 1 ? "" : "es"} above.
              </div>
            )}

            {/* Articles: top-20 from /api/search (with snippets) merged with
                the chronological tail from /api/articles (no snippets).
                Deduped by id; the top list wins. */}
            {data && data.articles.length > 0 && (
              <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Articles
              </div>
            )}
            {data?.articles.map((a) => (
              <button
                key={`s-${a.id}`}
                type="button"
                onClick={() => onSelect(a.id)}
                className={cn(
                  "text-left px-3 py-2 border-b border-border/50 hover:bg-accent/50 transition-colors",
                  activeArticle?.id === a.id && "bg-accent"
                )}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 mb-0.5">
                  {a.feedIconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.feedIconUrl} alt="" className="size-3 rounded-sm" />
                  )}
                  <span className="font-medium truncate">{a.feedTitle ?? "Unknown"}</span>
                  {a.publishedAt && (
                    <span className="text-muted-foreground/50 ml-auto shrink-0">
                      {new Date(a.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-[12px] font-semibold leading-snug line-clamp-2">
                  {a.titleParts.length > 0 ? (
                    <SearchSnippet parts={a.titleParts} />
                  ) : (
                    a.title ?? "(no title)"
                  )}
                </p>
                {a.snippetParts.length > 0 && (
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-2 mt-0.5">
                    <SearchSnippet parts={a.snippetParts} />
                  </p>
                )}
              </button>
            ))}

            {/* Chronological tail — the full list comes from the parent
                (which already dedupes against the top-20 via articleList). */}
            {articleList.length > 0 && (
              <>
                {data && data.articles.length > 0 && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    More
                  </div>
                )}
                <ArticleList
                  articles={articleList.map((a) => ({
                    ...a,
                    publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
                    createdAt: a.createdAt ? new Date(a.createdAt) : null,
                  }))}
                  activeId={activeArticle?.id}
                  onSelect={onSelect}
                  onStar={onStar}
                  compact
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={onLoadMore}
                  searchQuery={search}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RailSection({
  label,
  count,
  empty,
  children,
}: {
  label: string;
  count: number;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (empty) return null;
  return (
    <section>
      <div className="flex items-baseline gap-2 px-3 pt-3 pb-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </h3>
        <span className="text-[10px] text-muted-foreground/50">{count}</span>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function CenterHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8">
      {children}
    </div>
  );
}
