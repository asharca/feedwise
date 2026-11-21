"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Clock, RefreshCw } from "lucide-react";
import { useReaderShortcuts } from "@/components/article/article-list-controls";
import { ArticleReader } from "@/components/article/article-reader";
import { DatedArticleListPane } from "@/components/article/dated-article-list-pane";
import { ListReaderShell } from "@/components/article/list-reader-shell";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { Button } from "@/components/ui/button";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { flattenArticlePages } from "@/lib/reader/article-cache";
import { useArticleToggleMutation, useHistoryInfinite } from "@/lib/reader/use-articles";

function HistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get("articleId") ?? undefined;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const autoSummarize = useAutoSummarize();

  const historyQuery = useHistoryInfinite(debouncedSearch || undefined);
  const items = useMemo(() => flattenArticlePages(historyQuery.data), [historyQuery.data]);
  const displayItems = useMemo(() => items.map((item) => ({ ...item, isRead: true })), [items]);

  const {
    detail: active,
    loading: detailLoading,
    error: detailError,
    retry: retryDetail,
  } = useArticleDetail(articleId, { markReadOnOpen: false });

  const toggleMutation = useArticleToggleMutation();

  const selectArticle = useCallback(
    (id: string) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("articleId", id);
      router.replace(`/reader/history?${p.toString()}`);
    },
    [router, searchParams],
  );

  const closeArticle = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("articleId");
    const qs = p.toString();
    router.replace(qs ? `/reader/history?${qs}` : "/reader/history");
  }, [router, searchParams]);

  const handleLoadMore = useCallback(() => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
      void historyQuery.fetchNextPage();
    }
  }, [historyQuery]);

  const handleStar = useCallback(
    (id: string, starred: boolean) => {
      const feedId =
        items.find((a) => a.id === id)?.feedId ?? (active?.id === id ? active.feedId : undefined);
      toggleMutation.mutate({ id, patch: { isStarred: starred }, feedId });
    },
    [active, items, toggleMutation],
  );

  const handleMarkRead = useCallback(
    (id: string, read: boolean) => {
      const feedId =
        items.find((a) => a.id === id)?.feedId ?? (active?.id === id ? active.feedId : undefined);
      toggleMutation.mutate({ id, patch: { isRead: read }, feedId });
    },
    [active, items, toggleMutation],
  );

  useReaderShortcuts({
    article: active?.id === articleId ? active : null,
    onStar: handleStar,
    onMarkRead: handleMarkRead,
    onClose: closeArticle,
  });

  const listError = historyQuery.error
    ? historyQuery.error instanceof Error
      ? historyQuery.error.message
      : "请检查网络连接后重试。"
    : null;

  return (
    <ListReaderShell
      hasActive={Boolean(articleId)}
      list={
        <DatedArticleListPane
          title="阅读历史"
          headerIcon={Clock}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="按标题或订阅源筛选…"
          articles={displayItems}
          dateField="readAt"
          activeId={articleId}
          onSelect={selectArticle}
          onStar={handleStar}
          onMarkRead={handleMarkRead}
          layout={articleId ? "compact" : "grid"}
          loading={historyQuery.isPending}
          error={listError}
          onRetry={() => void historyQuery.refetch()}
          hasMore={Boolean(historyQuery.hasNextPage)}
          loadingMore={historyQuery.isFetchingNextPage}
          onLoadMore={handleLoadMore}
          emptyTitle={debouncedSearch ? "未找到匹配记录" : "暂无阅读历史"}
          emptyHint={
            debouncedSearch ? "试试更换搜索关键词。" : "阅读或标记已读的文章会出现在这里。"
          }
        />
      }
      reader={
        active?.id === articleId && active ? (
          <ArticleReader
            article={active}
            onMarkRead={handleMarkRead}
            onStar={handleStar}
            onBack={closeArticle}
            onSelectRelated={selectArticle}
            contextLabel="阅读历史"
            autoSummarize={autoSummarize ?? false}
          />
        ) : detailError ? (
          <HistoryDetailError error={detailError} onRetry={retryDetail} onBack={closeArticle} />
        ) : detailLoading || articleId ? (
          <ReaderSkeleton />
        ) : null
      }
    />
  );
}

function HistoryDetailError({
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

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryPageInner />
    </Suspense>
  );
}
