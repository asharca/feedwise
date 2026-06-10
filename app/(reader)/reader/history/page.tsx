"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";
import { ArticleReader } from "@/components/article/article-reader";
import {
  DatedArticleListPane,
  type DatedArticleItem,
} from "@/components/article/dated-article-list-pane";
import { ListReaderShell } from "@/components/article/list-reader-shell";
import { ReaderSkeleton } from "@/components/article/reader-skeleton";
import { useAutoSummarize } from "@/lib/hooks/use-auto-summarize";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useArticleDetail } from "@/lib/hooks/use-article-detail";
import { dispatchUnreadDelta } from "@/lib/reader/events";
import { patchArticle } from "@/lib/reader/article-api";

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
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const autoSummarize = useAutoSummarize();
  const abortRef = useRef<AbortController | null>(null);

  const { detail: active, setDetail: setActive } = useArticleDetail(articleId, {
    markReadOnOpen: false,
  });

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
    setLoading(true);
    load(debouncedSearch, 0)
      .then((rows) => {
        setItems(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setItems([]);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, load]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await load(debouncedSearch, items.length);
      setItems((prev) => [...prev, ...rows]);
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

  const handleStar = useCallback(async (id: string, starred: boolean) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a)));
    setActive((prev) => (prev?.id === id ? { ...prev, isStarred: starred } : prev));
    await patchArticle(id, { isStarred: starred });
  }, [setActive]);

  const handleMarkRead = useCallback(
    async (id: string, read: boolean) => {
      const target = items.find((a) => a.id === id);
      setActive((prev) => (prev?.id === id ? { ...prev, isRead: read } : prev));
      if (target) dispatchUnreadDelta(target.feedId, read ? -1 : 1);
      await patchArticle(id, { isRead: read });
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
        ) : articleId ? (
          <ReaderSkeleton />
        ) : null
      }
    />
  );
}

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryPageInner />
    </Suspense>
  );
}
