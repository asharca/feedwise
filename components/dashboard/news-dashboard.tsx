"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Star, ChevronRight, Rss } from "lucide-react";
import { cn } from "@/lib/utils";

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
  folderId: string | null;
  folderName: string | null;
}

interface ArticleGroup {
  folderId: string | null;
  folderName: string;
  articles: Article[];
}

interface NewsDashboardProps {
  onSelectArticle: (id: string) => void;
}

function ArticleCard({
  article,
  size = "normal",
  onSelect,
}: {
  article: Article;
  size?: "hero" | "normal" | "compact";
  onSelect: (id: string) => void;
}) {
  const excerpt = article.summary
    ? article.summary.replace(/<[^>]*>/g, "").slice(0, size === "hero" ? 200 : 100)
    : null;

  if (size === "hero") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(article.id)}
        onKeyDown={(e) => { if (e.key === "Enter") onSelect(article.id); }}
        className={cn(
          "group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg",
          "bg-card border border-border/50",
          article.isRead && "opacity-70"
        )}
      >
        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            className="w-full h-48 object-cover"
          />
        )}
        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-2">
            {article.feedIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={article.feedIconUrl} alt="" className="size-3.5 rounded-sm" />
            )}
            <span className="text-[11px] text-muted-foreground font-medium">
              {article.feedTitle}
            </span>
            {article.publishedAt && (
              <>
                <span className="text-[11px] text-muted-foreground/50">&middot;</span>
                <span className="text-[11px] text-muted-foreground/70">
                  {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                </span>
              </>
            )}
          </div>
          <h3 className={cn(
            "text-lg font-bold leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors",
            !article.isRead && "text-foreground"
          )}>
            {article.title ?? "(No title)"}
          </h3>
          {excerpt && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {excerpt}
            </p>
          )}
        </div>
        {article.isStarred && (
          <Star className="absolute top-3 right-3 size-4 fill-yellow-400 text-yellow-400" />
        )}
      </div>
    );
  }

  if (size === "compact") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(article.id)}
        onKeyDown={(e) => { if (e.key === "Enter") onSelect(article.id); }}
        className={cn(
          "group flex gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 hover:bg-accent/50",
          article.isRead && "opacity-60"
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-muted-foreground truncate">{article.feedTitle}</span>
            {article.publishedAt && (
              <>
                <span className="text-[10px] text-muted-foreground/50">&middot;</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                </span>
              </>
            )}
          </div>
          <p className={cn(
            "text-[13px] leading-snug line-clamp-2 group-hover:text-primary transition-colors",
            !article.isRead ? "font-semibold" : "font-normal"
          )}>
            {article.title ?? "(No title)"}
          </p>
        </div>
        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            className="size-12 rounded-lg object-cover shrink-0"
          />
        )}
      </div>
    );
  }

  // Normal card
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(article.id)}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(article.id); }}
      className={cn(
        "group rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md",
        "bg-card border border-border/50",
        article.isRead && "opacity-65"
      )}
    >
      {article.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          className="w-full h-32 object-cover"
        />
      )}
      <div className="p-3.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] text-muted-foreground font-medium truncate">
            {article.feedTitle}
          </span>
          {article.publishedAt && (
            <>
              <span className="text-[10px] text-muted-foreground/50">&middot;</span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
              </span>
            </>
          )}
        </div>
        <h3 className={cn(
          "text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors",
          !article.isRead ? "font-semibold" : "font-normal"
        )}>
          {article.title ?? "(No title)"}
        </h3>
        {excerpt && (
          <p className="text-[12px] text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">
            {excerpt}
          </p>
        )}
      </div>
    </div>
  );
}

function CategorySection({
  group,
  onSelectArticle,
  onViewCategory,
}: {
  group: ArticleGroup;
  onSelectArticle: (id: string) => void;
  onViewCategory: (folderId: string) => void;
}) {
  if (group.articles.length === 0) return null;

  const [hero, ...rest] = group.articles;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold tracking-tight">{group.folderName}</h2>
        {group.folderId && (
          <button
            type="button"
            onClick={() => onViewCategory(group.folderId!)}
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            View all
            <ChevronRight className="size-3" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1">
          <ArticleCard article={hero} size="hero" onSelect={onSelectArticle} />
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rest.slice(0, 4).map((article) => (
            <ArticleCard key={article.id} article={article} size="normal" onSelect={onSelectArticle} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function NewsDashboard({ onSelectArticle }: NewsDashboardProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<ArticleGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/articles/grouped");
        const data = await res.json();
        if (data.success) setGroups(data.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleViewCategory(folderId: string) {
    router.replace(`/reader?folderId=${folderId}&view=all`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="size-6 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 p-8">
        <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center">
          <Rss className="size-7 text-muted-foreground/30" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">No articles yet</p>
          <p className="text-xs text-muted-foreground/70">
            Add your first RSS feed to get started
          </p>
        </div>
      </div>
    );
  }

  // Featured: take the first article from the first group as the hero
  const allArticles = groups.flatMap((g) => g.articles);
  const featured = allArticles.slice(0, 3);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today&apos;s News</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your personalized news feed across all categories
          </p>
        </div>

        {/* Featured stories */}
        {featured.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold tracking-tight">Featured</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {featured.map((article, idx) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  size={idx === 0 ? "hero" : "normal"}
                  onSelect={onSelectArticle}
                />
              ))}
            </div>
          </section>
        )}

        {/* Category sections */}
        {groups.map((group) => (
          <CategorySection
            key={group.folderId ?? "uncategorized"}
            group={group}
            onSelectArticle={onSelectArticle}
            onViewCategory={handleViewCategory}
          />
        ))}
      </div>
    </div>
  );
}
