"use client";

import { TrendingUp, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RankChange } from "@/components/hot/hot-board-card";
import type { HotTrending } from "@/lib/hooks/use-hot";

export function HotTrends({
  data,
  loading,
  error,
  onRetry,
}: {
  data: HotTrending | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (!data && loading) {
    return (
      <div
        role="status"
        aria-label="正在加载热点趋势"
        className="h-48 animate-pulse rounded-xl border bg-muted/40 motion-reduce:animate-none"
      />
    );
  }
  return (
    <section aria-label="热点趋势" className="space-y-3">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border p-3 text-sm text-muted-foreground"
        >
          热点趋势加载失败：{error}
          <Button variant="outline" size="sm" onClick={onRetry}>
            重试
          </Button>
        </div>
      )}
      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section
            className="min-w-0 rounded-xl border bg-card p-4 lg:col-span-2"
            aria-labelledby="cross-platform-heading"
          >
            <h2
              id="cross-platform-heading"
              className="mb-3 flex items-center gap-2 text-sm font-semibold"
            >
              <Layers aria-hidden="true" className="size-4 text-muted-foreground" />
              跨平台热点
            </h2>
            {data.crossPlatform.length ? (
              <div
                className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
                tabIndex={0}
                role="region"
                aria-label="跨平台热点，可横向滚动"
              >
                {data.crossPlatform.map((event) => (
                  <article
                    key={event.title}
                    className="w-64 shrink-0 rounded-lg border bg-muted/20 p-3 sm:w-72"
                  >
                    <h3 className="mb-3 line-clamp-2 text-sm font-medium leading-5">
                      {event.title}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {event.sources.map((entry) => (
                        <a
                          key={entry.source.key}
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={entry.title}
                          className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {entry.source.name} <span className="tabular-nums">#{entry.rank}</span>
                          <span className="sr-only">：{entry.title}（在新标签页打开）</span>
                        </a>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无跨平台热点</p>
            )}
          </section>
          <section
            className="min-w-0 rounded-xl border bg-card p-4"
            aria-labelledby="rising-heading"
          >
            <h2 id="rising-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp
                aria-hidden="true"
                className="size-4 text-emerald-700 dark:text-emerald-400"
              />
              飙升
            </h2>
            {data.rising.length ? (
              <ol
                className="max-h-40 space-y-3 overflow-y-auto overscroll-contain pr-1 scrollbar-thin"
                tabIndex={0}
                aria-label="飙升排行，可滚动"
              >
                {data.rising.map((item) => (
                  <li key={`${item.source.key}:${item.id}`} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-1 rounded text-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {item.title}
                        <span className="sr-only">（在新标签页打开）</span>
                      </a>
                      <span className="text-[11px] text-muted-foreground">
                        {item.source.name} · 第 {item.rank} 名
                      </span>
                    </div>
                    <RankChange item={item} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无飙升热点，等待下一次榜单更新
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
