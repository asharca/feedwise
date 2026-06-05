"use client";

import { Suspense, useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArticleReader } from "@/components/article/article-reader";
import { ArticleDrawer } from "@/components/article/article-drawer";
import { DatedArticleListPane } from "@/components/article/dated-article-list-pane";
import { ListReaderShell } from "@/components/article/list-reader-shell";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { NewsDashboard } from "@/components/dashboard/news-dashboard";
import { SearchResultsPage } from "./_search-view/search-results-page";
import type { Article } from "./_search-view/types";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CheckCheck, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ArticleDetail extends Article {
  author: string | null;
  url: string | null;
  contentHtml: string | null;
  contentText: string | null;
  aiSummary?: string | null;
  importance?: "high" | "med" | "low" | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
}

function ReaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const feedId = searchParams.get("feedId") ?? undefined;
  const folderId = searchParams.get("folderId") ?? undefined;
  const tagId = searchParams.get("tag") ?? undefined;
  const view = searchParams.get("view") ?? "all";
  const search = searchParams.get("search") ?? undefined;
  const articleId = searchParams.get("articleId") ?? undefined;

  const [articleList, setArticleList] = useState<Article[]>([]);
  const [activeArticle, setActiveArticle] = useState<ArticleDetail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Tracks the in-flight pagination request so we can abort it when filters
  // change. Without this, a "load more" fetch from feed X can resolve AFTER
  // the user switches to feed Y and append X's next page onto Y's list —
  // showing a couple of stale articles mixed in with the new ones.
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  // Reader-level LLM preferences. `null` = not loaded yet (don't auto-trigger).
  const [autoSummarize, setAutoSummarize] = useState<boolean | null>(null);
  const [tagNameById, setTagNameById] = useState<Record<string, string>>({});
  // Per-view local search. Hits /api/articles?search=… scoped to the current
  // feed/folder/tag/view. Distinct from the URL `?search=` global palette
  // search, which triggers a different UI (SearchResultsPage).
  const [paneSearch, setPaneSearch] = useState("");
  const [debouncedPaneSearch, setDebouncedPaneSearch] = useState("");
  const PAGE_SIZE = 50;

  // Debounce pane search input → server fetch.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedPaneSearch(paneSearch.trim()), 250);
    return () => clearTimeout(id);
  }, [paneSearch]);

  // Clear pane search when the user switches scope — a query like "react"
  // makes sense within one feed but isn't carried across feed boundaries.
  useEffect(() => {
    setPaneSearch("");
    setDebouncedPaneSearch("");
  }, [feedId, folderId, tagId, view]);

  useEffect(() => {
    fetch("/api/email/llm/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        // Only auto-trigger when LLM is actually enabled AND user opted in.
        setAutoSummarize(Boolean(data.enabled) && Boolean(data.autoSummarize));
      })
      .catch(() => {
        setAutoSummarize(false);
      });
  }, []);

  useEffect(() => {
    function loadTags() {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((data) => {
          if (!data?.success) return;
          const map: Record<string, string> = {};
          for (const t of data.data ?? []) map[t.id] = t.name;
          setTagNameById(map);
        })
        .catch(() => {});
    }
    loadTags();
    window.addEventListener("tags-changed", loadTags);
    return () => window.removeEventListener("tags-changed", loadTags);
  }, []);

  // Dashboard is the home view. A specific article opened from dashboard is
  // shown as an overlay drawer on top of the dashboard instead of switching
  // to the 2-pane layout — that keeps the magazine context intact while
  // reading and makes the back behavior a trivial drawer dismiss.
  // `searchParams.has("search")` (vs Boolean(search)) catches the empty-input
  // case too — the sidebar's Search nav item lands users at `?search=` so the
  // search page renders with an empty query waiting for input.
  const hasSearchParam = searchParams.has("search");
  const showDashboard = view === "all" && !feedId && !folderId && !tagId && !hasSearchParam;
  const inSearchMode = hasSearchParam;

  const fetchArticles = useCallback(
    async (pageOffset: number, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (feedId) params.set("feedId", feedId);
      if (folderId) params.set("folderId", folderId);
      if (tagId) params.set("tag", tagId);
      if (view === "unread") params.set("unread", "true");
      if (view === "starred") params.set("starred", "true");
      // The URL-driven global search and the pane's per-view filter both map
      // to the API's `search` param. Only one is active at a time (the global
      // path renders SearchResultsPage, the pane is mounted only otherwise).
      const effectiveSearch = search || debouncedPaneSearch;
      if (effectiveSearch) params.set("search", effectiveSearch);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageOffset));
      const res = await fetch(`/api/articles?${params}`, { signal });
      const data = await res.json();
      if (data.success) return data.data as Article[];
      return [];
    },
    [feedId, folderId, tagId, view, search, debouncedPaneSearch, PAGE_SIZE],
  );

  // Reset and reload the LIST when filters change. The currently-open article
  // is driven separately by the articleId URL param, so we don't touch it here.
  //
  // The AbortController + cleanup is load-bearing: without it, a slower fetch
  // from feed X can resolve AFTER the user has already switched to feed Y and
  // overwrite Y's list with X's (whole or partial, depending on whether the
  // pagination "load more" race also fires). Cancelling on filter change keeps
  // only the latest request's result.
  useEffect(() => {
    if (showDashboard) return;
    const controller = new AbortController();
    // Cancel any in-flight pagination from the previous filter — its result
    // would otherwise be appended onto the new list.
    loadMoreAbortRef.current?.abort();
    setOffset(0);
    setHasMore(false);
    startTransition(async () => {
      try {
        const data = await fetchArticles(0, controller.signal);
        if (controller.signal.aborted) return;
        setArticleList(data);
        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        throw err;
      }
    });
    return () => controller.abort();
  }, [fetchArticles, showDashboard, PAGE_SIZE]);

  // Drive the open article from the URL: refreshing on ?articleId=… re-opens
  // the same article, and back/forward navigation Just Works.
  useEffect(() => {
    if (!articleId) {
      setActiveArticle(null);
      return;
    }
    if (activeArticle?.id === articleId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/articles/${articleId}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      if (data.success) {
        // Wrap the heavy ArticleReader mount in a transition so it can't
        // block in-flight animation frames (the shell slide-in spring may
        // still be running when this fetch resolves).
        startTransition(() => {
          setActiveArticle(data.data);
        });
        // Mark read (best-effort, non-blocking)
        if (data.data && !data.data.isRead) {
          fetch(`/api/articles/${articleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isRead: true }),
          }).catch(() => {});
          // Reflect read state in the list + sidebar counter
          setArticleList((prev) =>
            prev.map((a) => (a.id === articleId ? { ...a, isRead: true } : a)),
          );
          if (data.data.feedId) dispatchUnreadDelta(data.data.feedId, -1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // dispatchUnreadDelta is stable (defined inline below), excluded on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  function openArticle(id: string, opts?: { feedId?: string }) {
    const p = new URLSearchParams(searchParams.toString());
    if (opts?.feedId) {
      p.set("feedId", opts.feedId);
      p.set("view", "all");
      // dashboard-launched article: drop any unrelated filters
      p.delete("folderId");
      p.delete("tag");
    }
    p.set("articleId", id);
    router.replace(`/reader?${p.toString()}`);
  }

  function closeArticle() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("articleId");
    router.replace(`/reader?${p.toString()}`);
  }

  async function handleLoadMore() {
    const nextOffset = offset + PAGE_SIZE;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    setLoadingMore(true);
    try {
      const data = await fetchArticles(nextOffset, controller.signal);
      if (controller.signal.aborted) return;
      setArticleList((prev) => [...prev, ...data]);
      setOffset(nextOffset);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      throw err;
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  function dispatchUnreadDelta(feedId: string, delta: number) {
    window.dispatchEvent(new CustomEvent("feedwise:unread-delta", { detail: { feedId, delta } }));
  }

  function dispatchMarkAllRead(targetFeedId?: string, targetFolderId?: string) {
    window.dispatchEvent(
      new CustomEvent("feedwise:mark-all-read", {
        detail: { feedId: targetFeedId, folderId: targetFolderId },
      }),
    );
  }

  function handleSelect(id: string) {
    // Just update the URL — the articleId useEffect handles fetching and
    // marking-as-read uniformly for clicks AND refreshes.
    openArticle(id);
  }

  function handleDashboardSelect(id: string) {
    // Stay in dashboard mode — the article opens as a drawer overlay.
    openArticle(id);
  }

  async function handleStar(id: string, starred: boolean) {
    setArticleList((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
    if (activeArticle?.id === id) {
      setActiveArticle((prev) => (prev ? { ...prev, isStarred: starred } : prev));
    }
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isStarred: starred }),
    });
  }

  async function handleMarkRead(id: string, read: boolean) {
    const article = articleList.find((a) => a.id === id);
    const wasRead = article?.isRead ?? false;
    setArticleList((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: read } : a)));
    if (activeArticle?.id === id) {
      setActiveArticle((prev) => (prev ? { ...prev, isRead: read } : prev));
    }
    if (article && wasRead !== read) {
      dispatchUnreadDelta(article.feedId, read ? -1 : 1);
    }
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: read }),
    });
  }

  async function handleMarkAllRead() {
    const params = new URLSearchParams();
    if (feedId) params.set("feedId", feedId);
    if (folderId) params.set("folderId", folderId);
    await fetch(`/api/articles/mark-all-read?${params}`, { method: "POST" });
    setArticleList((prev) => prev.map((a) => ({ ...a, isRead: true })));
    dispatchMarkAllRead(feedId, folderId);
    toast.success("Marked all as read");
  }

  // Search results view. Shares the same two-pane container as the default
  // reader so clicking an article slides the reader in on the right, with
  // the search results staying mounted on the left.
  if (inSearchMode) {
    return (
      <div className="flex h-full">
        <div className={cn("shrink-0", activeArticle ? "hidden md:block" : "w-full md:w-auto")}>
          <SearchResultsPage
            search={search!}
            activeArticle={activeArticle}
            onSelect={handleSelect}
            onStar={handleStar}
            articleList={articleList}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        </div>
        <div
          className={cn(
            "flex-1 min-w-0 overflow-hidden border-l border-border",
            !activeArticle && "hidden md:block",
          )}
        >
          {activeArticle ? (
            <ArticleReader
              article={{
                ...activeArticle,
                publishedAt: activeArticle.publishedAt ? new Date(activeArticle.publishedAt) : null,
                createdAt: activeArticle.createdAt ? new Date(activeArticle.createdAt) : null,
              }}
              onMarkRead={handleMarkRead}
              onStar={handleStar}
              onBack={closeArticle}
              contextLabel={`"${search}"`}
              autoSummarize={autoSummarize ?? false}
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
  }

  // Dashboard. If an article is open on top of dashboard (articleId in URL),
  // it renders as a slide-in drawer overlay rather than swapping the layout.
  if (showDashboard) {
    return (
      <>
        <div className="flex flex-col h-full">
          <div className="md:hidden px-4 h-12 flex items-center gap-2 shrink-0 border-b border-border/50">
            <SidebarTrigger />
          </div>
          <div className="flex-1 min-h-0">
            <NewsDashboard onSelectArticle={handleDashboardSelect} />
          </div>
        </div>
        <ArticleDrawer open={Boolean(activeArticle)} onClose={closeArticle}>
          {activeArticle && (
            <ArticleReader
              article={{
                ...activeArticle,
                publishedAt: activeArticle.publishedAt ? new Date(activeArticle.publishedAt) : null,
                createdAt: activeArticle.createdAt ? new Date(activeArticle.createdAt) : null,
              }}
              onMarkRead={handleMarkRead}
              onStar={handleStar}
              onBack={closeArticle}
              contextLabel="Today's News"
              autoSummarize={autoSummarize ?? false}
            />
          )}
        </ArticleDrawer>
      </>
    );
  }

  // Article list view
  const viewTitle = tagId
    ? `#${tagNameById[tagId] ?? "tag"}`
    : feedId && articleList.length > 0
      ? (articleList[0].feedTitle ?? "Feed")
      : folderId
        ? "Category"
        : view === "unread"
          ? "Unread"
          : view === "starred"
            ? "Starred"
            : "Home";

  const headerActions = (
    <>
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
    </>
  );

  // Drive the layout from the URL (articleId), not the loaded detail —
  // otherwise the slide-in animation waits for the article fetch to resolve,
  // which the user perceives as click lag. The reader slot renders a
  // skeleton until the fetch lands.
  const hasActive = Boolean(articleId);
  const detailReady = activeArticle?.id === articleId;

  return (
    <ListReaderShell
      hasActive={hasActive}
      list={
        <DatedArticleListPane
          title={viewTitle}
          headerActions={headerActions}
          search={paneSearch}
          onSearchChange={setPaneSearch}
          searchPlaceholder="Filter this view…"
          articles={articleList}
          dateField="publishedAt"
          activeId={articleId}
          onSelect={handleSelect}
          layout={hasActive ? "compact" : "grid"}
          loading={isPending && articleList.length === 0}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          emptyTitle={debouncedPaneSearch ? "No matches" : "No articles"}
          emptyHint={
            debouncedPaneSearch
              ? "Try a different search."
              : "Articles from this view will show up here."
          }
        />
      }
      reader={
        detailReady && activeArticle ? (
          <ArticleReader
            article={{
              ...activeArticle,
              publishedAt: activeArticle.publishedAt ? new Date(activeArticle.publishedAt) : null,
              createdAt: activeArticle.createdAt ? new Date(activeArticle.createdAt) : null,
            }}
            onMarkRead={handleMarkRead}
            onStar={handleStar}
            onBack={closeArticle}
            contextLabel={viewTitle}
            autoSummarize={autoSummarize ?? false}
          />
        ) : (
          <ReaderSkeleton />
        )
      }
    />
  );
}

export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderContent />
    </Suspense>
  );
}
