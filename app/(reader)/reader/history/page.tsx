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

interface HistoryItem extends DatedArticleItem {
  // History items always have readAt set.
  readAt: string;
}

interface ArticleDetail {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl?: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  contentHtml: string | null;
  contentText: string | null;
  imageUrl?: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  aiSummary?: string | null;
  importance?: "high" | "med" | "low" | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
}

const PAGE_SIZE = 50;

function dispatchUnreadDelta(feedId: string, delta: number) {
  window.dispatchEvent(new CustomEvent("feedwise:unread-delta", { detail: { feedId, delta } }));
}

function HistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get("articleId") ?? undefined;

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [active, setActive] = useState<ArticleDetail | null>(null);
  const [autoSummarize, setAutoSummarize] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    fetch("/api/email/llm/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setAutoSummarize(Boolean(d.enabled) && Boolean(d.autoSummarize));
      })
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    if (!articleId) {
      setActive(null);
      return;
    }
    if (active?.id === articleId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/articles/${articleId}`);
      if (!res.ok || cancelled) return;
      const d = await res.json();
      if (cancelled || !d.success) return;
      setActive(d.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId, active?.id]);

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
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isStarred: starred }),
    });
  }, []);

  const handleMarkRead = useCallback(
    async (id: string, read: boolean) => {
      const target = items.find((a) => a.id === id);
      setActive((prev) => (prev?.id === id ? { ...prev, isRead: read } : prev));
      if (target) dispatchUnreadDelta(target.feedId, read ? -1 : 1);
      await fetch(`/api/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: read }),
      });
    },
    [items],
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
            autoSummarize={autoSummarize}
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
