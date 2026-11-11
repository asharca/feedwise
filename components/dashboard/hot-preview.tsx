"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Flame, TrendingUp } from "lucide-react";

interface TrendingPreview {
  crossPlatform: Array<{
    title: string;
    sources: Array<{
      source: { key: string; name: string };
      title: string;
      url: string;
      rank: number;
    }>;
  }>;
  rising: Array<{
    id: string;
    title: string;
    url: string;
    rankDelta: number | null;
    isNew: boolean;
    source: { key: string; name: string };
  }>;
}

export function HotPreview() {
  const [trending, setTrending] = useState<TrendingPreview | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/hot/trending", { signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json();
        if (result.success && !controller.signal.aborted) setTrending(result.data);
      } catch {
        // This optional overview must never block the RSS reading dashboard.
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (!trending || (!trending.crossPlatform.length && !trending.rising.length)) return null;
  return (
    <section aria-labelledby="hot-preview-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hot-preview-title" className="flex items-center gap-2 text-sm font-semibold">
          <Flame className="size-4 text-primary" aria-hidden="true" />
          热点速览
        </h2>
        <Link
          href="/hot"
          className="inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          查看全部
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        {trending.crossPlatform.length > 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">多平台关注</h3>
            <ol className="divide-y divide-border/60">
              {trending.crossPlatform.slice(0, 5).map((event) => (
                <li key={event.title} className="py-2.5">
                  <p className="line-clamp-2 text-sm font-medium leading-relaxed">{event.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{event.sources.length} 个平台</span>
                    {event.sources.map(({ source, url }) => (
                      <a
                        key={source.key}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary hover:underline"
                        aria-label={`${source.name}：${event.title}（新窗口打开）`}
                      >
                        {source.name}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {trending.rising.length > 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <h3 className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <TrendingUp className="size-3.5" aria-hidden="true" />
              热度上升
            </h3>
            <ol className="divide-y divide-border/60">
              {trending.rising.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded py-2.5"
                    aria-label={`${item.title}（新窗口打开）`}
                  >
                    <p className="line-clamp-2 text-sm font-medium leading-relaxed group-hover:text-primary">
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{item.source.name}</span>
                      {item.rankDelta !== null && item.rankDelta > 0 ? (
                        <span className="text-primary">↑ 上升 {item.rankDelta} 位</span>
                      ) : item.isNew ? (
                        <span className="text-primary">新上榜</span>
                      ) : null}
                    </div>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
