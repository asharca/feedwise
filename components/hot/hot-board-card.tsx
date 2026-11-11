"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { refreshHotSource, type HotBoard, type HotItem } from "@/lib/hooks/use-hot";
import { cn } from "@/lib/utils";

const categoryColors = {
  news: "bg-orange-500",
  tech: "bg-blue-500",
  community: "bg-emerald-500",
  entertainment: "bg-violet-500",
};

function formatHeat(value: number) {
  if (value >= 100_000_000) return `${Number((value / 100_000_000).toFixed(1))}亿`;
  if (value >= 10_000) return `${Number((value / 10_000).toFixed(1))}万`;
  return value.toLocaleString("zh-CN");
}

export function RankChange({ item }: { item: Pick<HotItem, "isNew" | "rankDelta"> }) {
  if (item.isNew) {
    return (
      <span className="rounded bg-orange-500/10 px-1 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">
        新
      </span>
    );
  }
  if (!item.rankDelta) return null;
  return (
    <span
      aria-label={`${item.rankDelta > 0 ? "上升" : "下降"}${Math.abs(item.rankDelta)}名`}
      className={cn(
        "text-[11px] tabular-nums",
        item.rankDelta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      {item.rankDelta > 0 ? "↑" : "↓"}
      {Math.abs(item.rankDelta)}
    </span>
  );
}

export function HotBoardCard({ board, onRefresh }: { board: HotBoard; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!queued) return;
    const timer = window.setTimeout(() => {
      setQueued(false);
      setRefreshing(false);
      onRefresh();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [queued, onRefresh]);

  const refresh = async () => {
    if (refreshing) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await refreshHotSource(board.source.key, current.signal);
      if (!current.signal.aborted) setQueued(true);
    } catch (error) {
      if (!current.signal.aborted) {
        setRefreshError(error instanceof Error ? error.message : "刷新失败，请稍后重试");
        setRefreshing(false);
      }
    }
  };

  const fetchedDate = board.fetchedAt ? new Date(board.fetchedAt) : null;
  const validDate = fetchedDate && !Number.isNaN(fetchedDate.getTime()) ? fetchedDate : null;

  return (
    <section
      aria-label={`${board.source.name}热榜`}
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground"
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", categoryColors[board.source.category])}
        />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{board.source.name}</h2>
        {validDate ? (
          <time
            dateTime={board.fetchedAt!}
            title={validDate.toLocaleString("zh-CN")}
            className="shrink-0 text-[11px] text-muted-foreground"
          >
            {formatDistanceToNowStrict(validDate, { addSuffix: true, locale: zhCN })}
          </time>
        ) : (
          <span className="text-[11px] text-muted-foreground">尚未更新</span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={refreshing}
          onClick={() => void refresh()}
          aria-label={`刷新${board.source.name}`}
        >
          <RefreshCw aria-hidden="true" className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </header>
      {board.status === "error" && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <span>此源暂时异常</span>
          <Tooltip>
            <TooltipTrigger
              aria-label={`${board.source.name}异常详情`}
              className="rounded p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info aria-hidden="true" className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{board.error || "暂时无法获取此来源的数据，请稍后重试"}</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            disabled={refreshing}
            onClick={() => void refresh()}
            aria-label={`重试${board.source.name}`}
          >
            重试
          </Button>
        </div>
      )}
      <div aria-live="polite" className="text-xs text-muted-foreground">
        {queued && <p className="px-4 py-2">已加入刷新队列，稍后更新</p>}
        {refreshError && (
          <p role="alert" className="px-4 py-2 text-destructive">
            {refreshError}
          </p>
        )}
      </div>
      {board.items.length ? (
        <div
          className="h-96 overflow-y-auto overscroll-contain scrollbar-thin"
          tabIndex={0}
          role="region"
          aria-label={`${board.source.name}排行，可滚动`}
        >
          {board.status === "error" && (
            <p className="px-4 pt-3 text-xs text-muted-foreground">以下为上次成功获取的榜单</p>
          )}
          <ol className="divide-y divide-border/50 px-3">
            {board.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2 py-3">
                <span
                  className={cn(
                    "w-6 shrink-0 pt-0.5 text-center text-sm font-semibold tabular-nums",
                    item.rank <= 3
                      ? "text-orange-700 dark:text-orange-400"
                      : "text-muted-foreground",
                  )}
                >
                  {item.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 rounded text-sm leading-5 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.title}
                    <span className="sr-only">（在新标签页打开）</span>
                  </a>
                  {(item.heat !== null || item.isNew || !!item.rankDelta) && (
                    <div className="mt-1.5 flex items-center gap-2">
                      {item.heat !== null && (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          热度 {formatHeat(item.heat)}
                        </span>
                      )}
                      <RankChange item={item} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="flex h-96 items-center justify-center px-4 text-sm text-muted-foreground">
          {board.status === "error" ? "暂时没有可展示的榜单" : "暂无热榜内容"}
        </div>
      )}
    </section>
  );
}

export function HotBoardsSkeleton() {
  return (
    <div
      role="status"
      aria-label="正在加载热榜"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-[450px] animate-pulse rounded-xl border bg-card p-4 motion-reduce:animate-none"
        >
          <div className="mb-7 h-4 w-1/2 rounded bg-muted" />
          {Array.from({ length: 6 }, (_, row) => (
            <div key={row} className="mb-6 h-8 rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}
