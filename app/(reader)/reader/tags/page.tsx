"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tag as TagIcon, Inbox } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DatedArticleListPane } from "@/components/article/dated-article-list-pane";
import { ArticleReader } from "@/components/article/article-reader";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { cn } from "@/lib/utils";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { patchArticle } from "@/lib/reader/article-api";

const spring = { type: "spring" as const, duration: 0.3, bounce: 0 };
const LIST_NARROW_PX = 384;

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
  const autoSummarize = useAutoSummarize();

  // Per-tag search (debounced server fetch).
  const [paneSearch, setPaneSearch] = useState("");
  const debouncedPaneSearch = useDebouncedValue(paneSearch.trim(), 250);
  const effectivePaneSearch = paneSearch.trim() === "" ? "" : debouncedPaneSearch;

  const { detail: active, setDetail: setActive } = useArticleDetail(articleId, {
    markReadOnOpen: true,
    onMarkedRead: (id) => {
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
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
      return;
    }
    let cancelled = false;
    setArticlesLoading(true);
    const params = new URLSearchParams();
    params.set("tag", tagId);
    params.set("limit", "100");
    if (effectivePaneSearch) params.set("search", effectivePaneSearch);
    fetch(`/api/articles?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.success) setArticles(d.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setArticlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tagId, effectivePaneSearch]);

  const selectTag = useCallback(
    (id: string) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tag", id);
      p.delete("articleId");
      router.replace(`/reader/tags?${p.toString()}`);
    },
    [router, searchParams],
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

  const handleStar = useCallback(async (id: string, starred: boolean) => {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
    setActive((prev) => (prev?.id === id ? { ...prev, isStarred: starred } : prev));
    await patchArticle(id, { isStarred: starred });
  }, [setActive]);

  const handleMarkRead = useCallback(
    async (id: string, read: boolean) => {
      const article = articles.find((a) => a.id === id);
      const wasRead = article?.isRead ?? false;
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: read } : a)));
      setActive((prev) => (prev?.id === id ? { ...prev, isRead: read } : prev));
      if (article && wasRead !== read) {
        dispatchUnreadDelta(article.feedId, read ? -1 : 1);
      }
      await patchArticle(id, { isRead: read });
    },
    [articles, setActive],
  );

  const selectedTag = tags.find((t) => t.id === tagId);
  const mappedArticles = articles.map(mapArticle);

  return (
    <div className="flex h-full">
      {/* Tag rail — left. Always visible on desktop; on mobile only when no
          tag or article is selected. */}
      <div
        className={cn(
          "flex flex-col border-r border-border bg-background shrink-0 md:w-60",
          tagId || articleId ? "hidden md:flex" : "w-full",
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
                    "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors group",
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

      {/* Article list — middle. Animated width via explicit pixel target so
          the spring stays deterministic when content swaps inside. */}
      <motion.div
        initial={false}
        animate={{
          // The middle pane is hidden until a tag is picked; once visible,
          // animate width between full ("flex-1") and collapsed (LIST_NARROW_PX).
          // We render width:auto (string) when no tag → still hidden, no anim.
          width: articleId ? LIST_NARROW_PX : "100%",
        }}
        transition={spring}
        className={cn(
          "border-r border-border shrink-0 min-w-0",
          articleId ? "hidden md:block" : tagId ? "block" : "hidden md:block",
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
              selectedTag && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {selectedTag.articleCount}
                </span>
              )
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
            emptyTitle={effectivePaneSearch ? "No matches" : "No articles"}
            emptyHint={effectivePaneSearch ? "Try a different search." : undefined}
          />
        )}
      </motion.div>

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
            ) : (
              <ReaderSkeleton />
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
