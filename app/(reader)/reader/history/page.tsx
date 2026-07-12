"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ArticleReader } from "@/components/article/article-reader";
import {
  DatedArticleListPane,
  type DatedArticleItem,
} from "@/components/article/dated-article-list-pane";
import { ListReaderShell } from "@/components/article/list-reader-shell";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { Button } from "@/components/ui/button";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { mergeUniqueArticles, patchArticle } from "@/lib/reader/article-api";

interface HistoryItem extends DatedArticleItem {
  // History items always have readAt set.
  readAt: string;
}

const PAGE_SIZE = 50;

function HistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get("articleId") ?? undefined;

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const autoSummarize = useAutoSummarize();
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const mutationVersionRef = useRef(new Map<string, number>());

  const {
    detail: active,
    setDetail: setActive,
    loading: detailLoading,
    error: detailError,
    retry: retryDetail,
  } = useArticleDetail(articleId, { markReadOnOpen: false });

  const load = useCallback(async (q: string, offset: number) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    if (q) params.set("search", q);

    const res = await fetch(`/api/articles/history?${params}`, { signal: ac.signal });
    if (!res.ok) throw new Error("Failed to load history");
    const json = await res.json();
    return (json?.data ?? []) as HistoryItem[];
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setListError(null);
    load(debouncedSearch, 0)
      .then((rows) => {
        if (requestId !== requestIdRef.current) return;
        setItems(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError" || requestId !== requestIdRef.current) return;
        setItems([]);
        setHasMore(false);
        setListError("Check your connection and try again.");
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [debouncedSearch, load, reloadKey]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await load(debouncedSearch, items.length);
      setItems((prev) => mergeUniqueArticles(prev, rows));
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

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

  const handleStar = useCallback(
    async (id: string, starred: boolean) => {
      const mutationKey = `${id}:starred`;
      const version = (mutationVersionRef.current.get(mutationKey) ?? 0) + 1;
      mutationVersionRef.current.set(mutationKey, version);
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
      setActive((prev) => (prev?.id === id ? { ...prev, isStarred: starred } : prev));
      try {
        await patchArticle(id, { isStarred: starred });
      } catch {
        if (mutationVersionRef.current.get(mutationKey) !== version) return;
        setItems((prev) =>
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
      const target = items.find((a) => a.id === id);
      const wasRead = target?.isRead ?? true;
      const mutationKey = `${id}:read`;
      const version = (mutationVersionRef.current.get(mutationKey) ?? 0) + 1;
      mutationVersionRef.current.set(mutationKey, version);
      setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: read } : a)));
      setActive((prev) => (prev?.id === id ? { ...prev, isRead: read } : prev));
      if (target && wasRead !== read) dispatchUnreadDelta(target.feedId, read ? -1 : 1);
      try {
        await patchArticle(id, { isRead: read });
      } catch {
        if (mutationVersionRef.current.get(mutationKey) !== version) return;
        setItems((prev) =>
          prev.map((article) => (article.id === id ? { ...article, isRead: wasRead } : article)),
        );
        setActive((current) => (current?.id === id ? { ...current, isRead: wasRead } : current));
        if (target && wasRead !== read) dispatchUnreadDelta(target.feedId, read ? 1 : -1);
        toast.error("Could not update read status");
      }
    },
    [items, setActive],
  );

  return (
    <ListReaderShell
      hasActive={Boolean(articleId)}
      list={
        <DatedArticleListPane
          title="Reading History"
          headerIcon={Clock}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Filter by title or feed…"
          articles={items.map((i) => ({ ...i, isRead: true }))}
          dateField="readAt"
          activeId={articleId}
          onSelect={selectArticle}
          layout={articleId ? "compact" : "grid"}
          loading={loading}
          error={listError}
          onRetry={() => setReloadKey((key) => key + 1)}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          emptyTitle={debouncedSearch ? "No results" : "No reading history yet"}
          emptyHint={
            debouncedSearch
              ? "Try a different search."
              : "Articles you read or mark as read show up here."
          }
        />
      }
      reader={
        active?.id === articleId && active ? (
          <ArticleReader
            article={{
              ...active,
              publishedAt: active.publishedAt ? new Date(active.publishedAt) : null,
              createdAt: active.createdAt ? new Date(active.createdAt) : null,
            }}
            onMarkRead={handleMarkRead}
            onStar={handleStar}
            onBack={closeArticle}
            contextLabel="History"
            autoSummarize={autoSummarize ?? false}
          />
        ) : detailError ? (
          <HistoryDetailError error={detailError} onRetry={retryDetail} onBack={closeArticle} />
        ) : detailLoading ? (
          <ReaderSkeleton />
        ) : articleId ? (
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

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryPageInner />
    </Suspense>
  );
}
