"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
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
import { ArticleRow, ArticleThumbnail, articleImageUrl } from "@/components/article/article-row";
import { ChartsPanel } from "@/components/dashboard/charts-panel";
import { CardEnter } from "@/components/motion/card-enter";
import { HotPreview } from "./hot-preview";
import { htmlToText } from "@/lib/utils";

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

function RecommendedArticle({
  article,
  onSelect,
}: {
  article: Article;
  onSelect: (id: string) => void;
}) {
  const excerpt = article.summary ? htmlToText(article.summary) : undefined;
  const date = displayedAt(article);
  return (
    <button
      type="button"
      onClick={() => onSelect(article.id)}
      aria-label={`阅读：${article.title ?? "无标题"}`}
      className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{article.feedTitle ?? "未知来源"}</span>
          {date && (
            <span>· {formatDistanceToNow(new Date(date), { addSuffix: true, locale: zhCN })}</span>
          )}
          {article.isStarred && (
            <Star aria-label="已收藏" className="size-3 fill-primary text-primary" />
          )}
        </div>
        <h3 className="mb-2 line-clamp-2 text-lg font-semibold leading-relaxed group-hover:text-primary">
          {article.title ?? "无标题"}
        </h3>
        {excerpt && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{excerpt}</p>
        )}
      </div>
      <ArticleThumbnail url={articleImageUrl(article)} className="size-20 sm:h-32 sm:w-40" />
    </button>
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

function StatItem({
  icon,
  label,
  value,
  href,
  onNav,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href?: string;
  onNav?: (href: string) => void;
}) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </>
  );
  return href ? (
    <button
      type="button"
      onClick={() => onNav?.(href)}
      className="inline-flex min-h-8 items-center gap-1.5 rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {content}
    </button>
  ) : (
    <span className="inline-flex min-h-8 items-center gap-1.5 px-1 text-xs text-muted-foreground">
      {content}
    </span>
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
        if (!groupedRes.ok || !groupedData.success) throw new Error("无法加载文章，请稍后重试");
        if (cancelled) return;
        setGroups(groupedData.data);
      } catch (error) {
        if (!cancelled) {
          setGroupsError(error instanceof Error ? error.message : "无法加载文章，请稍后重试");
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
        if (!statsRes.ok || !statsData.success) throw new Error("无法加载阅读统计，请稍后重试");
        if (cancelled) return;
        setStats(statsData.data);
      } catch (error) {
        if (!cancelled) {
          setStatsError(error instanceof Error ? error.message : "无法加载阅读统计，请稍后重试");
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
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">今日阅读</h1>
          <p className="mt-1 text-sm text-muted-foreground">从订阅与热点中，发现值得读的内容</p>
        </div>

        {/* Stats row */}
        {stats && (
          <section
            aria-label="阅读概览"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-3"
          >
            <StatItem
              icon={<CircleDot className="size-3.5" />}
              label="未读"
              value={stats.unread}
              href="/reader?view=unread"
              onNav={(href) => router.push(href)}
            />
            {stats.newToday > 0 && (
              <StatItem
                icon={<Sparkles className="size-3.5" />}
                label="今日新增"
                value={stats.newToday}
              />
            )}
            {stats.readThisWeek > 0 && (
              <StatItem
                icon={<BookOpen className="size-3.5" />}
                label="本周已读"
                value={stats.readThisWeek}
              />
            )}
            {stats.subscriptions > 0 && (
              <StatItem
                icon={<Rss className="size-3.5" />}
                label="订阅源"
                value={stats.subscriptions}
              />
            )}
            {stats.tags > 0 && (
              <StatItem
                icon={<Tag className="size-3.5" />}
                label="标签"
                value={stats.tags}
                href="/reader/tags"
                onNav={(href) => router.push(href)}
              />
            )}
            {stats.failingFeeds > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                {stats.failingFeeds} 个订阅源需要关注
              </span>
            )}
          </section>
        )}
        {statsLoading && !stats && (
          <div role="status" aria-label="正在加载阅读统计" className="flex min-h-8 items-center">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
        {statsError && !stats && (
          <ResourceError
            title="阅读统计暂不可用"
            message={statsError}
            retryLabel="重试统计"
            onRetry={() => setStatsReloadKey((key) => key + 1)}
          />
        )}

        <HotPreview />

        {/* Recommended articles */}
        {groupsLoading && groups.length === 0 && (
          <div
            role="status"
            aria-label="正在加载文章"
            className="flex min-h-40 items-center justify-center"
          >
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        )}
        {groupsError && (
          <ResourceError
            title="文章暂不可用"
            message={groupsError}
            retryLabel="重试加载"
            onRetry={() => setGroupsReloadKey((key) => key + 1)}
          />
        )}
        {!groupsLoading && !groupsError && groups.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-4 p-8 text-muted-foreground">
            <div className="flex size-14 items-center justify-center rounded-lg bg-muted">
              <Rss className="size-7 text-muted-foreground/30" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">还没有文章</p>
              <p className="text-xs text-muted-foreground">添加第一个 RSS 订阅源，开始阅读</p>
            </div>
          </div>
        )}
        {recommended.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              推荐阅读
            </h2>
            {recommended[0] && (
              <CardEnter>
                <RecommendedArticle article={recommended[0]} onSelect={onSelectArticle} />
              </CardEnter>
            )}
            {recommended.length > 1 && (
              <div className="divide-y divide-border/60">
                {recommended.slice(1).map((article) => (
                  <ArticleRow key={article.id} article={article} onSelect={onSelectArticle} />
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
