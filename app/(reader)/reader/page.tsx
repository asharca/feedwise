"use client";

import { Suspense, useState, useEffect, useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { ArticleList } from "@/components/article/article-list";
import { ArticleReader } from "@/components/article/article-reader";

interface Article {
  id: string;
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
  const view = searchParams.get("view") ?? "all";

  const [articleList, setArticleList] = useState<Article[]>([]);
  const [activeArticle, setActiveArticle] = useState<ArticleDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchArticles = useCallback(async () => {
    const params = new URLSearchParams();
    if (feedId) params.set("feedId", feedId);
    if (view === "unread") params.set("unread", "true");
    if (view === "starred") params.set("starred", "true");
    const res = await fetch(`/api/articles?${params}`);
    const data = await res.json();
    if (data.success) return data.data as Article[];
    return [];
  }, [feedId, view]);

  useEffect(() => {
    // Don't clear the list before fetching — keep stale data visible to avoid flash
    startTransition(() => {
      fetchArticles().then((data) => {
        setArticleList(data);
      });
    });
    setActiveArticle(null);
  }, [fetchArticles]);

  async function handleSelect(id: string) {
    setArticleList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
    );
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    const res = await fetch(`/api/articles/${id}`);
    const data = await res.json();
    if (data.success) setActiveArticle(data.data);
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
    setArticleList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: read } : a))
    );
    if (activeArticle?.id === id) {
      setActiveArticle((prev) => prev ? { ...prev, isRead: read } : prev);
    }
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: read }),
    });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;

      const currentIdx = activeArticle
        ? articleList.findIndex((a) => a.id === activeArticle.id)
        : -1;

      switch (e.key) {
        case "j": {
          const nextIdx = currentIdx + 1;
          if (nextIdx < articleList.length) {
            handleSelect(articleList[nextIdx].id);
          }
          break;
        }
        case "k": {
          const prevIdx = currentIdx - 1;
          if (prevIdx >= 0) {
            handleSelect(articleList[prevIdx].id);
          }
          break;
        }
        case "s": {
          if (activeArticle) {
            handleStar(activeArticle.id, !activeArticle.isStarred);
          }
          break;
        }
        case "m": {
          if (activeArticle) {
            handleMarkRead(activeArticle.id, !activeArticle.isRead);
          }
          break;
        }
        case "o": {
          if (activeArticle?.url) {
            window.open(activeArticle.url, "_blank");
          }
          break;
        }
        case "Escape": {
          setActiveArticle(null);
          break;
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const viewTitle =
    feedId && articleList.length > 0
      ? articleList[0].feedTitle ?? "Feed"
      : view === "all"
        ? "All Articles"
        : view === "unread"
          ? "Unread"
          : "Starred";

  return (
    <div className="flex h-full">
      {/* Article list panel */}
      <div className="w-[340px] shrink-0 border-r border-border/50 flex flex-col bg-background">
        <div className="px-4 py-3 h-12 flex items-center shrink-0">
          <h2 className="text-sm font-semibold tracking-tight">{viewTitle}</h2>
          {isPending && (
            <div className="ml-2 size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
          )}
        </div>
        <ArticleList
          articles={articleList.map((a) => ({
            ...a,
            publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
          }))}
          activeId={activeArticle?.id}
          onSelect={handleSelect}
          onStar={handleStar}
        />
      </div>

      {/* Reader panel */}
      <div className="flex-1 overflow-hidden bg-background">
        <ArticleReader
          article={
            activeArticle
              ? {
                  ...activeArticle,
                  publishedAt: activeArticle.publishedAt
                    ? new Date(activeArticle.publishedAt)
                    : null,
                }
              : null
          }
          onMarkRead={handleMarkRead}
          onStar={handleStar}
        />
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
