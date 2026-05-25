"use client";

import { Suspense, useState, useEffect, useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { ArticleList } from "@/components/article/article-list";
import { ArticleReader } from "@/components/article/article-reader";
import { NewsDashboard } from "@/components/dashboard/news-dashboard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CheckCheck, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  isRead: boolean;
  isStarred: boolean;
}

interface ArticleDetail extends Article {
  author: string | null;
  url: string | null;
  contentHtml: string | null;
  contentText: string | null;
}

function ReaderContent() {
  const searchParams = useSearchParams();
  const feedId = searchParams.get("feedId") ?? undefined;
  const folderId = searchParams.get("folderId") ?? undefined;
  const view = searchParams.get("view") ?? "all";
  const search = searchParams.get("search") ?? undefined;

  const [articleList, setArticleList] = useState<Article[]>([]);
  const [activeArticle, setActiveArticle] = useState<ArticleDetail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  const showDashboard = view === "all" && !feedId && !folderId && !search;

  const fetchArticles = useCallback(async (pageOffset: number) => {
    const params = new URLSearchParams();
    if (feedId) params.set("feedId", feedId);
    if (folderId) params.set("folderId", folderId);
    if (view === "unread") params.set("unread", "true");
    if (view === "starred") params.set("starred", "true");
    if (search) params.set("search", search);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(pageOffset));
    const res = await fetch(`/api/articles?${params}`);
    const data = await res.json();
    if (data.success) return data.data as Article[];
    return [];
  }, [feedId, folderId, view, search, PAGE_SIZE]);

  // Reset and reload when filters change
  useEffect(() => {
    if (showDashboard) return;
    setOffset(0);
    setHasMore(false);
    startTransition(async () => {
      const data = await fetchArticles(0);
      setArticleList(data);
      setHasMore(data.length === PAGE_SIZE);
    });
    setActiveArticle(null);
  }, [fetchArticles, showDashboard, PAGE_SIZE]);

  async function handleLoadMore() {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const data = await fetchArticles(nextOffset);
      setArticleList((prev) => [...prev, ...data]);
      setOffset(nextOffset);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  function dispatchUnreadDelta(feedId: string, delta: number) {
    window.dispatchEvent(new CustomEvent("feedwise:unread-delta", { detail: { feedId, delta } }));
  }

  function dispatchMarkAllRead(targetFeedId?: string, targetFolderId?: string) {
    window.dispatchEvent(new CustomEvent("feedwise:mark-all-read", { detail: { feedId: targetFeedId, folderId: targetFolderId } }));
  }

  async function handleSelect(id: string) {
    const article = articleList.find((a) => a.id === id);
    const wasUnread = article && !article.isRead;
    setArticleList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
    );
    if (wasUnread && article) dispatchUnreadDelta(article.feedId, -1);
    fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    }).catch(() => {});
    const res = await fetch(`/api/articles/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) setActiveArticle(data.data);
  }

  async function handleDashboardSelect(id: string) {
    const res = await fetch(`/api/articles/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      setActiveArticle(data.data);
      fetch(`/api/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      }).catch(() => {});
    }
  }

  async function handleStar(id: string, starred: boolean) {
    setArticleList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isStarred: starred } : a))
    );
    if (activeArticle?.id === id) {
      setActiveArticle((prev) => prev ? { ...prev, isStarred: starred } : prev);
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
    setArticleList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: read } : a))
    );
    if (activeArticle?.id === id) {
      setActiveArticle((prev) => prev ? { ...prev, isRead: read } : prev);
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

  // Dashboard
  if (showDashboard) {
    if (activeArticle) {
      return (
        <div className="flex h-full">
          <ArticleReader
            article={{ ...activeArticle, publishedAt: activeArticle.publishedAt ? new Date(activeArticle.publishedAt) : null }}
            onMarkRead={handleMarkRead}
            onStar={handleStar}
            onBack={() => setActiveArticle(null)}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full">
        <div className="md:hidden px-4 h-12 flex items-center gap-2 shrink-0 border-b border-border/50">
          <SidebarTrigger />
        </div>
        <div className="flex-1 min-h-0">
          <NewsDashboard onSelectArticle={handleDashboardSelect} />
        </div>
      </div>
    );
  }

  // Article list view
  const viewTitle = search
    ? `"${search}"`
    : feedId && articleList.length > 0
      ? (articleList[0].feedTitle ?? "Feed")
      : folderId
        ? "Category"
        : view === "unread"
          ? "Unread"
          : view === "starred"
            ? "Starred"
            : "All Articles";

  const mappedArticles = articleList.map((a) => ({
    ...a,
    publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
  }));

  return (
    <div className="flex h-full">
      {/* Article list panel — left */}
      <div className={cn(
        "flex flex-col border-r border-border bg-background shrink-0",
        activeArticle ? "w-80 hidden md:flex" : "w-full md:w-80"
      )}>
        <div className="px-3 h-11 flex items-center gap-2 shrink-0 border-b border-border">
          <SidebarTrigger className="md:hidden" />
          <h2 className="text-sm font-semibold tracking-tight truncate">{viewTitle}</h2>
          <div className="ml-auto flex items-center gap-1">
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
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ArticleList
            articles={mappedArticles}
            activeId={activeArticle?.id}
            onSelect={handleSelect}
            onStar={handleStar}
            compact
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            searchQuery={search}
          />
        </div>
      </div>

      {/* Reader panel — right */}
      <div className={cn(
        "flex-1 min-w-0 overflow-hidden",
        !activeArticle && "hidden md:block"
      )}>
        {activeArticle ? (
          <ArticleReader
            article={{ ...activeArticle, publishedAt: activeArticle.publishedAt ? new Date(activeArticle.publishedAt) : null }}
            onMarkRead={handleMarkRead}
            onStar={handleStar}
            onBack={() => setActiveArticle(null)}
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

export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderContent />
    </Suspense>
  );
}
