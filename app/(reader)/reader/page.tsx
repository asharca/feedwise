"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, CheckCheck, CircleAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ContentView } from "@/lib/db/schema-types";
import { ArticleDrawer } from "@/components/article/article-drawer";
import { useReaderShortcuts } from "@/components/article/article-list-controls";
import { ArticleReader } from "@/components/article/article-reader";
import { DatedArticleListPane } from "@/components/article/dated-article-list-pane";
import { ListReaderShell } from "@/components/article/list-reader-shell";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { NewsDashboard } from "@/components/dashboard/news-dashboard";
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
  useMarkAllReadMutation,
  useTagsQuery,
} from "@/lib/reader/use-articles";
import { cn } from "@/lib/utils";
import { SearchResultsPage } from "./_search-view/search-results-page";
import type { Article } from "./_search-view/types";

function ReaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const feedId = searchParams.get("feedId") ?? undefined;
  const folderId = searchParams.get("folderId") ?? undefined;
  const tagId = searchParams.get("tag") ?? undefined;
  const rawView = searchParams.get("view");
  const navView = rawView === "unread" || rawView === "starred" ? rawView : "all";
  const contentView =
    parseContentView(searchParams.get("contentView")) ?? parseContentView(rawView);
  const search = searchParams.get("search") ?? undefined;
  const since = searchParams.get("since") ?? undefined;
  const articleId = searchParams.get("articleId") ?? undefined;

  // True when the open article was launched via an in-app click so "Back" can pop
  // that history entry while still collapsing cleanly on deep links / refreshes.
  const openedInAppRef = useRef(false);
  const autoSummarize = useAutoSummarize();

  // Per-view local search scoped to the current feed/folder/tag/view.
  const [paneSearch, setPaneSearch] = useState("");
  const debouncedPaneSearch = useDebouncedValue(paneSearch.trim(), 250);
  const effectivePaneSearch = paneSearch.trim() === "" ? "" : debouncedPaneSearch;

  useEffect(() => {
    setPaneSearch("");
  }, [feedId, folderId, tagId, navView, contentView]);

  const hasSearchParam = searchParams.has("search");
  const showDashboard =
    navView === "all" && !contentView && !feedId && !folderId && !tagId && !hasSearchParam;
  const inSearchMode = hasSearchParam;

  const listFilter = useMemo<ArticleListFilter>(() => {
    const effectiveSearch = search || effectivePaneSearch;
    return {
      feedId,
      folderId,
      tagId,
      unread: navView === "unread" ? true : undefined,
      starred: navView === "starred" ? true : undefined,
      since,
      search: effectiveSearch || undefined,
      view: contentView,
    };
  }, [feedId, folderId, tagId, navView, since, search, effectivePaneSearch, contentView]);

  const listEnabled = !showDashboard && (!inSearchMode || Boolean(search?.trim()));
  const articlesQuery = useArticlesInfinite(listFilter, listEnabled);
  const articleList = useMemo<Article[]>(
    () => (listEnabled ? flattenArticlePages(articlesQuery.data) : []),
    [articlesQuery.data, listEnabled],
  );

  const tagsQuery = useTagsQuery();
  const tagNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tag of tagsQuery.data ?? []) map[tag.id] = tag.name;
    return map;
  }, [tagsQuery.data]);

  const {
    detail: activeArticle,
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
  const markAllReadMutation = useMarkAllReadMutation();

  const openArticle = useCallback(
    (id: string, opts?: { feedId?: string }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (opts?.feedId) {
        p.set("feedId", opts.feedId);
        p.set("view", "all");
        p.delete("folderId");
        p.delete("tag");
      }
      const switching = searchParams.has("articleId");
      p.set("articleId", id);
      if (switching) {
        router.replace(`/reader?${p.toString()}`);
      } else {
        openedInAppRef.current = true;
        router.push(`/reader?${p.toString()}`);
      }
    },
    [router, searchParams],
  );

  const closeArticle = useCallback(() => {
    if (openedInAppRef.current) {
      openedInAppRef.current = false;
      router.back();
      return;
    }
    const p = new URLSearchParams(searchParams.toString());
    p.delete("articleId");
    const qs = p.toString();
    router.replace(qs ? `/reader?${qs}` : "/reader");
  }, [router, searchParams]);

  const handleContentViewChange = useCallback(
    (next: ContentView | undefined) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next) {
        p.set("contentView", next);
      } else {
        p.delete("contentView");
      }
      if (parseContentView(p.get("view"))) {
        p.delete("view");
      }
      p.delete("articleId");
      const qs = p.toString();
      router.replace(qs ? `/reader?${qs}` : "/reader");
    },
    [router, searchParams],
  );

  const handleLoadMore = useCallback(() => {
    if (articlesQuery.hasNextPage && !articlesQuery.isFetchingNextPage) {
      void articlesQuery.fetchNextPage();
    }
  }, [articlesQuery]);

  const handleStar = useCallback(
    (id: string, starred: boolean) => {
      const feedForArticle =
        articleList.find((a) => a.id === id)?.feedId ??
        (activeArticle?.id === id ? activeArticle.feedId : undefined);
      toggleMutation.mutate({ id, patch: { isStarred: starred }, feedId: feedForArticle });
    },
    [activeArticle, articleList, toggleMutation],
  );

  const handleMarkRead = useCallback(
    (id: string, read: boolean) => {
      const feedForArticle =
        articleList.find((a) => a.id === id)?.feedId ??
        (activeArticle?.id === id ? activeArticle.feedId : undefined);
      toggleMutation.mutate({ id, patch: { isRead: read }, feedId: feedForArticle });
    },
    [activeArticle, articleList, toggleMutation],
  );

  const handleMarkAllRead = useCallback(() => {
    if (tagId || navView === "starred" || markAllReadMutation.isPending) return;
    markAllReadMutation.mutate({ feedId, folderId });
  }, [feedId, folderId, markAllReadMutation, navView, tagId]);

  const hasActive = Boolean(articleId);
  const detailReady = activeArticle?.id === articleId;

  useReaderShortcuts({
    article: detailReady && activeArticle ? activeArticle : null,
    onStar: handleStar,
    onMarkRead: handleMarkRead,
    onClose: closeArticle,
  });

  function renderActiveReader(contextLabel: string) {
    if (!articleId) return null;
    if (detailReady && activeArticle) {
      return (
        <ArticleReader
          article={activeArticle}
          onMarkRead={handleMarkRead}
          onStar={handleStar}
          onBack={closeArticle}
          onSelectRelated={openArticle}
          contextLabel={contextLabel}
          autoSummarize={autoSummarize ?? false}
        />
      );
    }
    if (articleError) {
      return (
        <ArticleDetailError error={articleError} onRetry={retryArticle} onBack={closeArticle} />
      );
    }
    if (articleLoading) return <ReaderSkeleton />;
    return <ReaderSkeleton />;
  }

  if (inSearchMode) {
    return (
      <div className="flex h-full">
        <div className={cn("shrink-0", hasActive ? "hidden xl:block" : "w-full xl:w-auto")}>
          <SearchResultsPage
            search={search!}
            activeArticle={detailReady ? activeArticle : null}
            onSelect={openArticle}
            onStar={handleStar}
            articleList={articleList}
            hasMore={Boolean(articlesQuery.hasNextPage)}
            loadingMore={articlesQuery.isFetchingNextPage}
            onLoadMore={handleLoadMore}
          />
        </div>
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden border-l border-border",
            !hasActive && "hidden xl:block",
          )}
        >
          {hasActive ? (
            renderActiveReader(`"${search}"`)
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex size-14 items-center justify-center rounded-lg bg-muted">
                <BookOpen className="size-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm">选择一篇文章开始阅读</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showDashboard) {
    return (
      <>
        <div className="flex h-full flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4 md:hidden">
            <SidebarTrigger />
          </div>
          <div className="min-h-0 flex-1">
            <NewsDashboard onSelectArticle={openArticle} />
          </div>
        </div>
        <ArticleDrawer open={hasActive} onClose={closeArticle}>
          {renderActiveReader("今日资讯")}
        </ArticleDrawer>
      </>
    );
  }

  const viewTitle = tagId
    ? `#${tagNameById[tagId] ?? "标签"}`
    : feedId && articleList.length > 0
      ? (articleList[0].feedTitle ?? "订阅源")
      : folderId
        ? "分类"
        : navView === "unread"
          ? "未读"
          : navView === "starred"
            ? "收藏"
            : "全部文章";

  const listError = articlesQuery.error
    ? articlesQuery.error instanceof Error
      ? articlesQuery.error.message
      : "请检查网络连接后重试。"
    : null;

  const headerActions = (
    <>
      {articlesQuery.isFetching && !articlesQuery.isPending && (
        <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      )}
      {!tagId && navView !== "starred" && articleList.some((a) => !a.isRead) && (
        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={markAllReadMutation.isPending}
          title="全部标为已读"
          aria-label="全部标为已读"
          className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50 md:size-7"
        >
          {markAllReadMutation.isPending ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <CheckCheck className="size-3.5" />
          )}
        </button>
      )}
    </>
  );

  return (
    <ListReaderShell
      hasActive={hasActive}
      list={
        <DatedArticleListPane
          title={viewTitle}
          headerActions={headerActions}
          search={paneSearch}
          onSearchChange={setPaneSearch}
          searchPlaceholder="在当前视图中筛选…"
          contentView={contentView}
          onContentViewChange={handleContentViewChange}
          articles={articleList}
          dateField="publishedAt"
          activeId={articleId}
          onSelect={openArticle}
          onStar={handleStar}
          onMarkRead={handleMarkRead}
          layout={hasActive ? "compact" : "grid"}
          loading={articlesQuery.isPending}
          error={listError}
          onRetry={() => void articlesQuery.refetch()}
          hasMore={Boolean(articlesQuery.hasNextPage)}
          loadingMore={articlesQuery.isFetchingNextPage}
          onLoadMore={handleLoadMore}
          emptyTitle={effectivePaneSearch ? "未找到匹配文章" : "暂无文章"}
          emptyHint={
            effectivePaneSearch ? "试试更换筛选关键词。" : "当前视图下的新文章会显示在这里。"
          }
        />
      }
      reader={renderActiveReader(viewTitle)}
    />
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

export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderContent />
    </Suspense>
  );
}
