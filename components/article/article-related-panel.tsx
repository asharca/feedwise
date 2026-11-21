"use client";

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ExternalLink, Newspaper, Rss } from "lucide-react";
import { useRelatedArticlesQuery } from "@/lib/reader/use-articles";
import { proxyImg } from "@/lib/utils";

interface ArticleRelatedPanelProps {
  articleId: string;
  onSelectArticle?: (articleId: string) => void;
}

/**
 * Displays near-duplicate coverage from other subscribed feeds (`GET /api/articles/[id]/related`).
 * Hidden entirely when there are no related items.
 */
export function ArticleRelatedPanel({ articleId, onSelectArticle }: ArticleRelatedPanelProps) {
  const { data } = useRelatedArticlesQuery(articleId);

  if (!data || data.length === 0) return null;

  return (
    <section aria-label="相关报道" className="mt-10 border-t border-border pt-6">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Newspaper className="size-3.5" aria-hidden="true" />
        <span>相关报道</span>
      </div>
      <ul className="space-y-1.5">
        {data.map((item) => {
          const date = item.publishedAt ? new Date(item.publishedAt) : null;
          const relTime =
            date && !Number.isNaN(date.getTime())
              ? formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
              : null;

          const inner = (
            <div className="flex items-start gap-2.5">
              {item.feedIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImg(item.feedIconUrl, 96)}
                  alt=""
                  decoding="async"
                  className="mt-0.5 size-4 shrink-0 rounded-sm"
                />
              ) : (
                <Rss className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-foreground">
                  {item.title ?? "无标题"}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{item.feedTitle ?? "未知来源"}</span>
                  {relTime && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{relTime}</span>
                    </>
                  )}
                </div>
              </div>
              {!onSelectArticle && item.url && (
                <ExternalLink
                  className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>
          );

          return (
            <li key={item.id}>
              {onSelectArticle ? (
                <button
                  type="button"
                  onClick={() => onSelectArticle(item.id)}
                  className="w-full rounded-md border border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                >
                  {inner}
                </button>
              ) : item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md border border-border/60 px-3 py-2.5 transition-colors hover:bg-accent/60"
                >
                  {inner}
                </a>
              ) : (
                <div className="rounded-md border border-border/60 px-3 py-2.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
