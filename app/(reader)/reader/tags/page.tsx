"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleAlert, Inbox, RefreshCw, Tag as TagIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { ContentView } from "@/lib/db/schema-types";
import { useReaderShortcuts } from "@/components/article/article-list-controls";
import { ArticleReader } from "@/components/article/article-reader";
import { DatedArticleListPane } from "@/components/article/dated-article-list-pane";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { flattenArticlePages, parseContentView } from "@/lib/reader/article-cache";
import type { ArticleListFilter } from "@/lib/reader/types";
import {
  useArticlesInfinite,
  useArticleToggleMutation,
  useTagsQuery,
} from "@/lib/reader/use-articles";
import { cn } from "@/lib/utils";

const spring = { type: "spring" as const, duration: 0.3, bounce: 0 };

function TagsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tagId = searchParams.get("tag") ?? undefined;
  const articleId = searchParams.get("articleId") ?? undefined;
  const contentView = parseContentView(searchParams.get("contentView"));
  const autoSummarize = useAutoSummarize();

  const [paneSearch, setPaneSearch] = useState("");
  const debouncedPaneSearch = useDebouncedValue(paneSearch.trim(), 250);
  const effectivePaneSearch = paneSearch.trim() === "" ? "" : debouncedPaneSearch;

  useEffect(() => {
    setPaneSearch("");
  }, [tagId, contentView]);

  const tagsQuery = useTagsQuery();
  const tags = tagsQuery.data ?? [];

  const listFilter = useMemo<ArticleListFilter>(
    () => ({
      tagId,
      search: effectivePaneSearch || undefined,
      view: contentView,
    }),
    [tagId, effectivePaneSearch, contentView],
  );

  const articlesQuery = useArticlesInfinite(listFilter, Boolean(tagId));
  const articles = useMemo(
    () => (tagId ? flattenArticlePages(articlesQuery.data) : []),
    [articlesQuery.data, tagId],
  );

  const {
    detail: active,
    loading: articleLoading,
    error: articleError,
    retry: retryArticle,
  } = useArticleDetail(articleId, {
    markReadOnOpen: true,
    onMarkReadFailed: () => {
      toast.error("自动标记已读失败");
    },
  });

  const toggleMutation = useArticleToggleMutation();

  const selectTag = useCallback(
    (id: string) => {
      if (id === tagId) {
        void articlesQuery.refetch();
        return;
      }
      const p = new URLSearchParams(searchParams.toString());
      p.set("tag", id);
      p.delete("articleId");
      router.replace(`/reader/tags?${p.toString()}`);
    },
    [articlesQuery, router, searchParams, tagId],
  );

  const clearTag = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("tag");
    p.delete("articleId");
    p.delete("contentView");
    const qs = p.toString();
    router.replace(qs ? `/reader/tags?${qs}` : "/reader/tags");
  }, [router, searchParams]);

  const handleContentViewChange = useCallback(
    (next: ContentView | undefined) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next) p.set("contentView", next);
      else p.delete("contentView");
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
    const qs = p.toString();
    router.replace(qs ? `/reader/tags?${qs}` : "/reader/tags");
  }, [router, searchParams]);

  const handleLoadMore = useCallback(() => {
    if (articlesQuery.hasNextPage && !articlesQuery.isFetchingNextPage) {
      void articlesQuery.fetchNextPage();
    }
  }, [articlesQuery]);

  const handleStar = useCallback(
    (id: string, starred: boolean) => {
      const feedId =
        articles.find((a) => a.id === id)?.feedId ??
        (active?.id === id ? active.feedId : undefined);
      toggleMutation.mutate({ id, patch: { isStarred: starred }, feedId });
    },
    [active, articles, toggleMutation],
  );

  const handleMarkRead = useCallback(
    (id: string, read: boolean) => {
      const feedId =
        articles.find((a) => a.id === id)?.feedId ??
        (active?.id === id ? active.feedId : undefined);
      toggleMutation.mutate({ id, patch: { isRead: read }, feedId });
    },
    [active, articles, toggleMutation],
  );

  useReaderShortcuts({
    article: active?.id === articleId ? active : null,
    onStar: handleStar,
    onMarkRead: handleMarkRead,
    onClose: closeArticle,
  });

  const selectedTag = tags.find((t) => t.id === tagId);
  const articlesError = articlesQuery.error
    ? articlesQuery.error instanceof Error
      ? articlesQuery.error.message
      : "文章加载失败"
    : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Tag list — left column */}
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-border bg-background xl:w-64",
          tagId && "hidden xl:flex",
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <SidebarTrigger className="md:hidden" />
          <TagIcon className="size-4" />
          <h2 className="truncate text-sm font-semibold tracking-tight">标签</h2>
          {!tagsQuery.isPending && (
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {tags.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          {tagsQuery.isPending ? (
            <div className="space-y-1.5 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
              <Inbox className="size-8 text-muted-foreground/30" />
              <p className="text-sm font-medium">暂无标签</p>
              <p className="text-xs text-muted-foreground/70">
                在阅读器中为文章添加标签或配置自动标签规则后，标签会显示在这里。
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {tags.map((tag) => {
                const isSelected = tag.id === tagId;
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      onClick={() => selectTag(tag.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-accent/60",
                      )}
                    >
                      <TagIcon className="size-3.5 shrink-0 opacity-70" />
                      <span className="flex-1 truncate">{tag.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {tag.articleCount}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Articles for selected tag — middle pane */}
      <div
        className={cn(
          "min-w-0 shrink-0 border-r border-border",
          !tagId ? "hidden flex-1 xl:block" : articleId ? "hidden xl:block xl:w-96" : "flex-1",
        )}
      >
        {!tagId ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <TagIcon className="size-8 text-muted-foreground/30" />
            <p className="text-sm">选择一个标签查看文章</p>
          </div>
        ) : (
          <DatedArticleListPane
            title={selectedTag ? `#${selectedTag.name}` : "标签"}
            headerActions={
              <>
                <button
                  type="button"
                  onClick={clearTag}
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground xl:hidden"
                  aria-label="返回标签列表"
                >
                  <ArrowLeft className="size-3.5" />
                  标签
                </button>
                {selectedTag && !articlesError && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {selectedTag.articleCount}
                  </span>
                )}
              </>
            }
            search={paneSearch}
            onSearchChange={setPaneSearch}
            searchPlaceholder="在当前标签中筛选…"
            contentView={contentView}
            onContentViewChange={handleContentViewChange}
            articles={articles}
            dateField="publishedAt"
            activeId={articleId}
            onSelect={selectArticle}
            onStar={handleStar}
            onMarkRead={handleMarkRead}
            layout={articleId ? "compact" : "grid"}
            loading={articlesQuery.isPending}
            error={articlesError}
            onRetry={() => void articlesQuery.refetch()}
            hasMore={Boolean(articlesQuery.hasNextPage)}
            loadingMore={articlesQuery.isFetchingNextPage}
            onLoadMore={handleLoadMore}
            emptyTitle={effectivePaneSearch ? "未找到匹配文章" : "暂无文章"}
            emptyHint={effectivePaneSearch ? "试试更换搜索关键词。" : undefined}
          />
        )}
      </div>

      {/* Reader — right pane */}
      <AnimatePresence initial={false}>
        {articleId && (
          <motion.div
            key="tags-reader"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={spring}
            className="min-w-0 flex-1 overflow-hidden"
          >
            {active?.id === articleId ? (
              <ArticleReader
                article={active}
                onMarkRead={handleMarkRead}
                onStar={handleStar}
                onBack={closeArticle}
                onSelectRelated={selectArticle}
                contextLabel={selectedTag ? `#${selectedTag.name}` : "标签"}
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
            ) : (
              <ReaderSkeleton />
            )}
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
        <p className="text-sm font-medium">无法打开这篇文章</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          重试
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          返回列表
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
