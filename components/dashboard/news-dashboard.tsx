"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Star, Rss, CircleDot, AlertTriangle, BookOpen, Sparkles, Tag } from "lucide-react";
import { ArticleCard as SharedArticleCard } from "@/components/article/article-card";
import { ChartsPanel } from "@/components/dashboard/charts-panel";
import { CardEnter } from "@/components/motion/card-enter";
import { cn, proxyImg } from "@/lib/utils";

interface Article {
  id: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  importance?: "high" | "med" | "low" | null;
  folderId: string | null;
  folderName: string | null;
}

function displayedAt(article: {
  publishedAt: string | null;
  createdAt: string | null;
}): string | null {
  return article.publishedAt ?? article.createdAt;
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
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect(article.id);
        }}
        className={cn(
          "group relative rounded-lg overflow-hidden cursor-pointer transition-colors duration-200 ease-[var(--ease-out)] hover:border-foreground/20",
          "bg-card border border-border",
          article.isRead && "opacity-70",
        )}
      >
        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(article.imageUrl, 1280)}
            alt=""
            loading="eager"
            decoding="sync"
            className="w-full h-48 object-cover img-gpu"
          />
        )}
        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-2">
            {article.feedIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyImg(article.feedIconUrl, 96)}
                alt=""
                loading="eager"
                decoding="sync"
                className="size-3.5 rounded-sm img-gpu"
              />
            )}
            <span className="text-[11px] text-muted-foreground font-medium">
              {article.feedTitle}
            </span>
            {displayedAt(article) && (
              <>
                <span className="text-[11px] text-muted-foreground/50">&middot;</span>
                <span className="text-[11px] text-muted-foreground/70">
                  {formatDistanceToNow(new Date(displayedAt(article)!), { addSuffix: true })}
                </span>
              </>
            )}
          </div>
          <h3
            className={cn(
              "text-lg font-semibold leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors",
              !article.isRead && "text-foreground",
            )}
          >
            {article.title ?? "(No title)"}
          </h3>
          {excerpt && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{excerpt}</p>
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
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect(article.id);
        }}
        className={cn(
          "group flex gap-3 p-3 rounded-md cursor-pointer transition-colors duration-150 hover:bg-accent/50",
          article.isRead && "opacity-60",
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-muted-foreground truncate">{article.feedTitle}</span>
            {displayedAt(article) && (
              <>
                <span className="text-[10px] text-muted-foreground/50">&middot;</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {formatDistanceToNow(new Date(displayedAt(article)!), { addSuffix: true })}
                </span>
              </>
            )}
          </div>
          <p
            className={cn(
              "text-[13px] leading-snug line-clamp-2 group-hover:text-primary transition-colors",
              !article.isRead ? "font-semibold" : "font-normal",
            )}
          >
            {article.title ?? "(No title)"}
          </p>
        </div>
        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(article.imageUrl, 96)}
            alt=""
            loading="eager"
            decoding="sync"
            className="size-12 rounded-lg object-cover shrink-0 img-gpu"
          />
        )}
      </div>
    );
  }

  // Normal card — delegates to the shared ArticleCard template
  return (
    <SharedArticleCard article={article} onSelect={onSelect} />
  );
}

interface Stats {
  subscriptions: number;
  failingFeeds: number;
  unread: number;
  newToday: number;
  readThisWeek: number;
  tags: number;
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
  sublabelTone,
  href,
  onNav,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel?: string;
  sublabelTone?: "warn";
  href?: string;
  onNav?: (href: string) => void;
}) {
  const clickable = Boolean(href);
  const Wrapper: React.ElementType = clickable ? "button" : "div";
  const wrapperProps = clickable
    ? {
        type: "button" as const,
        onClick: () => (href && onNav ? onNav(href) : undefined),
      }
    : {};
  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors duration-200 ease-[var(--ease-out)]",
        clickable && "hover:border-primary/40 hover:bg-primary/5 cursor-pointer",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</div>
      {sublabel && (
        <div
          className={cn(
            "mt-1 text-[11px]",
            sublabelTone === "warn" ? "text-destructive" : "text-muted-foreground/70",
          )}
        >
          {sublabelTone === "warn" && (
            <AlertTriangle className="inline size-3 mr-1 -mt-0.5 align-middle" />
          )}
          {sublabel}
        </div>
      )}
    </Wrapper>
  );
}

export function NewsDashboard({ onSelectArticle }: NewsDashboardProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<ArticleGroup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [groupedRes, statsRes] = await Promise.all([
          fetch("/api/articles/grouped"),
          fetch("/api/dashboard/stats"),
        ]);
        const [groupedData, statsData] = await Promise.all([groupedRes.json(), statsRes.json()]);
        if (groupedData.success) setGroups(groupedData.data);
        if (statsData.success) setStats(statsData.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
        <div className="size-14 rounded-lg bg-muted flex items-center justify-center">
          <Rss className="size-7 text-muted-foreground/30" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">No articles yet</p>
          <p className="text-xs text-muted-foreground/70">Add your first RSS feed to get started</p>
        </div>
      </div>
    );
  }

  // Recommended: top of the chronological list, biased by importance so high-
  // importance articles surface even if they aren't the freshest.
  const importanceRank = (i: Article["importance"] | undefined | null) =>
    i === "high" ? 0 : i === "med" ? 1 : 2;
  const recommended = groups
    .flatMap((g) => g.articles)
    .slice()
    .sort((a, b) => {
      const diff = importanceRank(a.importance) - importanceRank(b.importance);
      if (diff !== 0) return diff;
      // tie-break: original chronological order (already sorted by date desc upstream)
      return 0;
    })
    .slice(0, 9);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="px-4 sm:px-6 py-5 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Today&apos;s News</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your personalized news feed</p>
        </div>

        {/* Charts (own date range) */}
        <ChartsPanel />

        {/* Stats row */}
        {stats && (
          <section>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              <StatCard
                icon={<CircleDot className="size-3.5" />}
                label="Unread"
                value={stats.unread}
                href={stats.unread > 0 ? "/reader?view=unread" : undefined}
                onNav={(href) => router.push(href)}
              />
              <StatCard
                icon={<Sparkles className="size-3.5" />}
                label="New today"
                value={stats.newToday}
                sublabel={stats.newToday > 0 ? "last 24 hours" : "all caught up"}
              />
              <StatCard
                icon={<BookOpen className="size-3.5" />}
                label="Read this week"
                value={stats.readThisWeek}
                sublabel="last 7 days"
              />
              <StatCard
                icon={<Rss className="size-3.5" />}
                label="Feeds"
                value={stats.subscriptions}
                sublabel={
                  stats.failingFeeds > 0 ? `${stats.failingFeeds} need attention` : "all healthy"
                }
                sublabelTone={stats.failingFeeds > 0 ? "warn" : undefined}
              />
              <StatCard
                icon={<Tag className="size-3.5" />}
                label="Tags"
                value={stats.tags}
                href={stats.tags > 0 ? "/reader/tags" : undefined}
                onNav={(href) => router.push(href)}
              />
            </div>
          </section>
        )}

        {/* Recommended articles */}
        {recommended.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Recommended
            </h2>
            {recommended[0] && (
              <CardEnter>
                <ArticleCard article={recommended[0]} size="hero" onSelect={onSelectArticle} />
              </CardEnter>
            )}
            {recommended.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {recommended.slice(1).map((article, index) => (
                  <CardEnter key={article.id} index={index}>
                    <ArticleCard article={article} size="normal" onSelect={onSelectArticle} />
                  </CardEnter>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
