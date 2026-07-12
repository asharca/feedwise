"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleAlert, RefreshCw, Tag as TagIcon, Inbox } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DatedArticleListPane } from "@/components/article/dated-article-list-pane";
import { ArticleReader } from "@/components/article/article-reader";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { patchArticle } from "@/lib/reader/article-api";

const spring = { type: "spring" as const, duration: 0.3, bounce: 0 };

interface TagItem {
  id: string;
  name: string;
  color: string | null;
  articleCount: number;
}

interface ApiArticle {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary: string | null;
  imageUrl?: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
}

function mapArticle(a: ApiArticle) {
  return {
    ...a,
    publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
    createdAt: a.createdAt ? new Date(a.createdAt) : null,
  };
}

function TagsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tagId = searchParams.get("tag") ?? undefined;
  const articleId = searchParams.get("articleId") ?? undefined;

  const [tags, setTags] = useState<TagItem[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [articles, setArticles] = useState<ApiArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [articlesReloadKey, setArticlesReloadKey] = useState(0);
  const autoSummarize = useAutoSummarize();
  const mutationVersionRef = useRef(new Map<string, number>());

  // Per-tag search (debounced server fetch).
  const [paneSearch, setPaneSearch] = useState("");
  const debouncedPaneSearch = useDebouncedValue(paneSearch.trim(), 250);
  const effectivePaneSearch = paneSearch.trim() === "" ? "" : debouncedPaneSearch;

  const {
    detail: active,
    setDetail: setActive,
    loading: articleLoading,
    error: articleError,
    retry: retryArticle,
  } = useArticleDetail(articleId, {
    markReadOnOpen: true,
    onMarkedRead: (id) => {
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    },
    onMarkReadFailed: (id) => {
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: false } : a)));
      toast.error("Could not mark article as read");
    },
  });

  // Load tags (with live refresh when articles get tagged/untagged elsewhere)
  useEffect(() => {
    function load() {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((d) => {
          if (d?.success) setTags(d.data ?? []);
        })
        .catch(() => {})
        .finally(() => setTagsLoading(false));
    }
    load();
    window.addEventListener("tags-changed", load);
    return () => window.removeEventListener("tags-changed", load);
  }, []);

  // Clear pane search when the user switches tag.
  // effectivePaneSearch guard makes the clear instantaneous (no debounce wait).
  useEffect(() => {
    setPaneSearch("");
  }, [tagId]);

  // Load articles for the selected tag (with optional search filter)
  useEffect(() => {
    if (!tagId) {
      setArticles([]);
      setArticlesError(null);
      setArticlesLoading(false);
      return;
    }

    const controller = new AbortController();
    setArticles([]);
    setArticlesError(null);
    setArticlesLoading(true);
    const params = new URLSearchParams();
    params.set("tag", tagId);
    params.set("limit", "100");
    if (effectivePaneSearch) params.set("search", effectivePaneSearch);

    async function loadArticles() {
      try {
        const response = await fetch(`/api/articles?${params}`, { signal: controller.signal });
        const body = (await response.json()) as {
          success?: boolean;
          data?: ApiArticle[];
          error?: string;
        };
        if (!response.ok || !body.success) {
          throw new Error(body.error ?? "Failed to load articles");
        }
        if (!controller.signal.aborted) setArticles(body.data ?? []);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setArticles([]);
        setArticlesError("Couldn't load articles");
      } finally {
        if (!controller.signal.aborted) setArticlesLoading(false);
      }
    }

    void loadArticles();
    return () => controller.abort();
  }, [tagId, effectivePaneSearch, articlesReloadKey]);

  const selectTag = useCallback(
    (id: string) => {
      setArticles([]);
      setArticlesError(null);
      setArticlesLoading(true);
      if (id === tagId) {
        setArticlesReloadKey((key) => key + 1);
        return;
      }
      const p = new URLSearchParams(searchParams.toString());
      p.set("tag", id);
      p.delete("articleId");
      router.replace(`/reader/tags?${p.toString()}`);
    },
    [router, searchParams, tagId],
  );

  const selectArticle = useCallback(
    (id: string) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("articleId", id);
      router.replace(`/reader/tags?${p.toString()}`);
    },
    [router, searchParams],
  );

  const closeArticle = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("articleId");
    router.replace(`/reader/tags?${p.toString()}`);
  }, [router, searchParams]);

  const showTags = useCallback(() => {
    setArticles([]);
    setArticlesError(null);
    setArticlesLoading(false);
    setPaneSearch("");
    const p = new URLSearchParams(searchParams.toString());
    p.delete("tag");
    p.delete("articleId");
    const query = p.toString();
    router.replace(query ? `/reader/tags?${query}` : "/reader/tags");
  }, [router, searchParams]);

  const retryArticles = useCallback(() => {
    setArticles([]);
    setArticlesError(null);
    setArticlesLoading(true);
    setArticlesReloadKey((key) => key + 1);
  }, []);

  const handleStar = useCallback(
    async (id: string, starred: boolean) => {
      const mutationKey = `${id}:starred`;
      const version = (mutationVersionRef.current.get(mutationKey) ?? 0) + 1;
      mutationVersionRef.current.set(mutationKey, version);
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
      setActive((prev) => (prev?.id === id ? { ...prev, isStarred: starred } : prev));
      try {
        await patchArticle(id, { isStarred: starred });
      } catch {
        if (mutationVersionRef.current.get(mutationKey) !== version) return;
        setArticles((prev) =>
          prev.map((article) =>
            article.id === id ? { ...article, isStarred: !starred } : article,
          ),
        );
        setActive((current) =>
          current?.id === id ? { ...current, isStarred: !starred } : current,
        );
        toast.error("Could not update star");
      }
    },
    [setActive],
  );

  const handleMarkRead = useCallback(
    async (id: string, read: boolean) => {
      const article = articles.find((a) => a.id === id);
      const wasRead = article?.isRead ?? false;
      const mutationKey = `${id}:read`;
      const version = (mutationVersionRef.current.get(mutationKey) ?? 0) + 1;
      mutationVersionRef.current.set(mutationKey, version);
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: read } : a)));
      setActive((prev) => (prev?.id === id ? { ...prev, isRead: read } : prev));
      if (article && wasRead !== read) {
        dispatchUnreadDelta(article.feedId, read ? -1 : 1);
      }
      try {
        await patchArticle(id, { isRead: read });
      } catch {
        if (mutationVersionRef.current.get(mutationKey) !== version) return;
        setArticles((prev) =>
          prev.map((current) => (current.id === id ? { ...current, isRead: wasRead } : current)),
        );
        setActive((current) => (current?.id === id ? { ...current, isRead: wasRead } : current));
        if (article && wasRead !== read) dispatchUnreadDelta(article.feedId, read ? 1 : -1);
        toast.error("Could not update read status");
      }
    },
    [articles, setActive],
  );

  const selectedTag = tags.find((t) => t.id === tagId);
  const mappedArticles = articles.map(mapArticle);

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {/* Below xl this is the first step in a focused tags → articles → reader
          flow. Wide screens keep the rail visible as the first of three panes. */}
      <div
        className={cn(
          "flex flex-col border-r border-border bg-background shrink-0",
          tagId || articleId ? "hidden xl:flex xl:w-60" : "w-full xl:w-60",
        )}
      >
        <div className="px-3 h-11 flex items-center gap-2 shrink-0 border-b border-border">
          <SidebarTrigger className="md:hidden" />
          <TagIcon className="size-4" />
          <h2 className="text-sm font-semibold tracking-tight">Tags</h2>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {tagsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            </div>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-muted-foreground gap-2 text-center">
              <Inbox className="size-8 text-muted-foreground/30" />
              <p className="text-sm font-medium">No tags yet</p>
              <p className="text-xs text-muted-foreground/70">
                Enable Auto-tag in Settings → Smart Digest, or add tags from any article.
              </p>
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTag(t.id)}
                  className={cn(
                    "group flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors xl:min-h-8",
                    tagId === t.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-foreground",
                  )}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <TagIcon
                      className={cn(
                        "size-3 shrink-0",
                        tagId === t.id ? "text-primary" : "text-muted-foreground/70",
                      )}
                    />
                    <span className="truncate">{t.name}</span>
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground/70 shrink-0">
                    {t.articleCount}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The middle pane fills the remaining width until an article opens. At
          xl it becomes a fixed 24rem rail; below xl the reader replaces it. */}
      <div
        className={cn(
          "min-w-0 overflow-hidden border-r border-border",
          articleId
            ? "hidden xl:block xl:w-96 xl:shrink-0"
            : tagId
              ? "block flex-1"
              : "hidden xl:block xl:flex-1",
        )}
      >
        {!tagId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8">
            <TagIcon className="size-10 text-muted-foreground/30" />
            <p className="text-sm text-center">Pick a tag on the left to see its articles.</p>
          </div>
        ) : (
          <DatedArticleListPane
            title={selectedTag?.name ?? "Tag"}
            headerIcon={TagIcon}
            headerActions={
              <>
                <button
                  type="button"
                  onClick={showTags}
                  className="xl:hidden inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Back to tags"
                >
                  <ArrowLeft className="size-3.5" />
                  Tags
                </button>
                {articlesError && (
                  <button
                    type="button"
                    onClick={retryArticles}
                    className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <RefreshCw className="size-3.5" />
                    Retry
                  </button>
                )}
                {selectedTag && !articlesError && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {selectedTag.articleCount}
                  </span>
                )}
              </>
            }
            search={paneSearch}
            onSearchChange={setPaneSearch}
            searchPlaceholder="Filter in this tag…"
            articles={mappedArticles}
            dateField="publishedAt"
            activeId={articleId}
            onSelect={selectArticle}
            layout={articleId ? "compact" : "grid"}
            loading={articlesLoading}
            emptyTitle={
              articlesError ? articlesError : effectivePaneSearch ? "No matches" : "No articles"
            }
            emptyHint={
              articlesError
                ? "Retry, or return to the tag list."
                : effectivePaneSearch
                  ? "Try a different search."
                  : undefined
            }
          />
        )}
      </div>

      {/* Reader — right. Slides in from the right when an article opens.
          Driven by `articleId` (URL) not `active` (loaded) so the slide
          starts immediately on click; skeleton fills in until fetch lands. */}
      <AnimatePresence initial={false}>
        {articleId && (
          <motion.div
            key="tags-reader"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={spring}
            className="flex-1 min-w-0 overflow-hidden"
          >
            {active?.id === articleId ? (
              <ArticleReader
                article={{
                  ...active,
                  publishedAt: active.publishedAt ? new Date(active.publishedAt) : null,
                  createdAt: active.createdAt ? new Date(active.createdAt) : null,
                }}
                onMarkRead={handleMarkRead}
                onStar={handleStar}
                onBack={closeArticle}
                contextLabel={selectedTag ? `#${selectedTag.name}` : "Tags"}
                autoSummarize={autoSummarize ?? false}
              />
            ) : articleError ? (
              <ArticleDetailError
                error={articleError}
                onRetry={retryArticle}
                onBack={closeArticle}
              />
            ) : articleLoading ? (
              <ReaderSkeleton />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ArticleDetailError({
  error,
  onRetry,
  onBack,
}: {
  error: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-lg bg-destructive/10">
        <CircleAlert className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Could not open this article</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Retry
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          Back to list
        </Button>
      </div>
    </div>
  );
}

export default function TagsPage() {
  return (
    <Suspense>
      <TagsPageInner />
    </Suspense>
  );
}
