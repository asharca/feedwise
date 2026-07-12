"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Star,
  Rss,
  CircleDot,
  AlertTriangle,
  BookOpen,
  Sparkles,
  Tag,
  RefreshCw,
} from "lucide-react";
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
        aria-label={`Read ${article.title ?? "untitled article"}`}
        onClick={() => onSelect(article.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(article.id);
          }
        }}
        className={cn(
          "group relative rounded-lg overflow-hidden cursor-pointer transition-colors duration-200 ease-[var(--ease-out)] hover:border-foreground/20",
          "bg-card border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring",
          article.isRead && "opacity-70",
        )}
      >
        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(article.imageUrl, 1280)}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-48 object-cover"
          />
        )}
        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-2">
            {article.feedIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyImg(article.feedIconUrl, 96)}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-3.5 rounded-sm"
              />
            )}
            <span className="text-xs font-medium text-muted-foreground">{article.feedTitle}</span>
            {displayedAt(article) && (
              <>
                <span className="text-xs text-muted-foreground">&middot;</span>
                <span className="text-xs text-muted-foreground">
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
        aria-label={`Read ${article.title ?? "untitled article"}`}
        onClick={() => onSelect(article.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(article.id);
          }
        }}
        className={cn(
          "group flex gap-3 p-3 rounded-md cursor-pointer outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
          article.isRead && "opacity-60",
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="truncate text-xs text-muted-foreground">{article.feedTitle}</span>
            {displayedAt(article) && (
              <>
                <span className="text-xs text-muted-foreground">&middot;</span>
                <span className="shrink-0 text-xs text-muted-foreground">
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
            loading="lazy"
            decoding="async"
            className="size-12 rounded-lg object-cover shrink-0"
          />
        )}
      </div>
    );
  }

  // Normal card — delegates to the shared ArticleCard template
  return <SharedArticleCard article={article} onSelect={onSelect} />;
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
        "min-w-0 border-b border-r border-border px-3.5 py-3 text-left outline-none transition-colors duration-200 ease-[var(--ease-out)] last:border-r-0 last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&:last-child]:col-span-2 md:[&:last-child]:col-span-1 md:border-b-0",
        clickable && "hover:border-primary/40 hover:bg-primary/5 cursor-pointer",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums leading-none">{value}</div>
      {sublabel && (
        <div
          className={cn(
            "mt-1 text-xs",
            sublabelTone === "warn" ? "text-destructive" : "text-muted-foreground",
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

function ResourceError({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <RefreshCw className="size-3.5" />
        {retryLabel}
      </button>
    </div>
  );
}

export function NewsDashboard({ onSelectArticle }: NewsDashboardProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<ArticleGroup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [groupsReloadKey, setGroupsReloadKey] = useState(0);
  const [statsReloadKey, setStatsReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadGroups() {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const groupedRes = await fetch("/api/articles/grouped");
        const groupedData = await groupedRes.json();
        if (!groupedRes.ok || !groupedData.success) throw new Error("Could not load your articles");
        if (cancelled) return;
        setGroups(groupedData.data);
      } catch (error) {
        if (!cancelled) {
          setGroupsError(error instanceof Error ? error.message : "Could not load your articles");
        }
      } finally {
        if (!cancelled) setGroupsLoading(false);
      }
    }

    loadGroups();
    return () => {
      cancelled = true;
    };
  }, [groupsReloadKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const statsRes = await fetch("/api/dashboard/stats");
        const statsData = await statsRes.json();
        if (!statsRes.ok || !statsData.success) throw new Error("Could not load reading stats");
        if (cancelled) return;
        setStats(statsData.data);
      } catch (error) {
        if (!cancelled) {
          setStatsError(error instanceof Error ? error.message : "Could not load reading stats");
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [statsReloadKey]);

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
    <div className="h-full overflow-y-auto scrollbar-thin animate-in fade-in duration-300 ease-[var(--ease-out)] motion-reduce:animate-none">
      <div className="mx-auto max-w-[100rem] space-y-7 px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Today&apos;s News</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your personalized news feed</p>
        </div>

        {/* Stats row */}
        {stats && (
          <section aria-label="Reading overview">
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card md:grid-cols-5">
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
        {statsLoading && !stats && (
          <div
            role="status"
            aria-label="Loading reading stats"
            className="flex min-h-20 items-center justify-center rounded-lg border border-border bg-card"
          >
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
        {statsError && !stats && (
          <ResourceError
            title="Reading stats unavailable"
            message={statsError}
            retryLabel="Retry stats"
            onRetry={() => setStatsReloadKey((key) => key + 1)}
          />
        )}

        {/* Recommended articles */}
        {groupsLoading && groups.length === 0 && (
          <div
            role="status"
            aria-label="Loading articles"
            className="flex min-h-40 items-center justify-center"
          >
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
        {groupsError && (
          <ResourceError
            title="Articles unavailable"
            message={groupsError}
            retryLabel="Retry articles"
            onRetry={() => setGroupsReloadKey((key) => key + 1)}
          />
        )}
        {!groupsLoading && !groupsError && groups.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-8 text-muted-foreground">
            <div className="flex size-14 items-center justify-center rounded-lg bg-muted">
              <Rss className="size-7 text-muted-foreground/30" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">No articles yet</p>
              <p className="text-xs text-muted-foreground">
                Add your first RSS feed to get started
              </p>
            </div>
          </div>
        )}
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
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2.5">
                {recommended.slice(1).map((article, index) => (
                  <CardEnter key={article.id} index={index}>
                    <ArticleCard article={article} size="normal" onSelect={onSelectArticle} />
                  </CardEnter>
                ))}
              </div>
            )}
          </section>
        )}

        <ChartsPanel />
      </div>
    </div>
  );
}
