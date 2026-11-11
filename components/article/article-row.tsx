"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Rss, Star } from "lucide-react";
import { cn, htmlToText, proxyImg } from "@/lib/utils";
import { Highlight, type ArticleCardItem } from "./article-card";

/** Only article imagery belongs in a row; site icons and tracking pixels do not. */
export function articleImageUrl(article: ArticleCardItem): string | null {
  const url =
    article.imageUrl || article.summary?.match(/<img[^>]+src=["'](https:\/\/[^"'>\s]+)["']/i)?.[1];
  if (!url || url === article.feedIconUrl) return null;
  try {
    const image = new URL(url);
    if (!/^https?:$/.test(image.protocol)) return null;
    if (/(?:^|[/_.-])(?:favicon|logo|avatar|spacer|pixel)(?:[/_.-]|$)/i.test(image.pathname))
      return null;
    return url;
  } catch {
    return null;
  }
}

export function ArticleThumbnail({
  url,
  className,
  width = 480,
}: {
  url: string | null;
  className: string;
  width?: 96 | 480 | 1280;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyImg(url, width)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrl(url)}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 72 || event.currentTarget.naturalHeight < 48)
          setFailedUrl(url);
      }}
      className={cn("shrink-0 rounded-md object-cover transform-gpu backface-hidden", className)}
    />
  );
}

export function ArticleRow({
  article,
  active = false,
  onSelect,
  onStar,
  searchQuery,
  displayedAt,
}: {
  article: ArticleCardItem;
  active?: boolean;
  onSelect: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  searchQuery?: string;
  displayedAt?: Date | string | null;
}) {
  const timestamp = displayedAt ?? article.publishedAt ?? article.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  const excerpt = article.summary ? htmlToText(article.summary) : undefined;
  return (
    <article
      data-article-id={article.id}
      className={cn(
        "group relative flex scroll-mt-8 items-center gap-3 rounded-md py-3 pl-3 pr-2 text-left transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring",
        active ? "bg-primary/10" : "hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        data-article-open
        aria-label={`阅读：${article.title ?? "无标题"}`}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(article.id)}
        className="absolute inset-0 z-10 rounded-md outline-none"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {article.feedIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(article.feedIconUrl, 96)}
              alt=""
              decoding="async"
              className="size-3.5 shrink-0 rounded-sm"
            />
          ) : (
            <Rss className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{article.feedTitle ?? "未知来源"}</span>
          {date && !Number.isNaN(date.getTime()) && (
            <time dateTime={date.toISOString()} className="ml-auto shrink-0">
              {formatDistanceToNow(date, { addSuffix: true, locale: zhCN })}
            </time>
          )}
        </div>
        <h3
          className={cn(
            "line-clamp-2 text-[15px] font-semibold leading-relaxed",
            article.isRead && !active && "text-muted-foreground",
          )}
        >
          {!article.isRead && (
            <span
              aria-label="未读"
              className="mb-0.5 mr-1.5 inline-block size-1.5 rounded-full bg-primary"
            />
          )}
          <Highlight text={article.title ?? "无标题"} query={searchQuery} />
        </h3>
        {excerpt && (
          <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-muted-foreground">
            <Highlight text={excerpt} query={searchQuery} />
          </p>
        )}
      </div>
      <ArticleThumbnail
        url={articleImageUrl(article)}
        className="size-[72px] self-center sm:size-20"
      />
      {onStar ? (
        <button
          type="button"
          onClick={() => onStar(article.id, !article.isStarred)}
          aria-label={article.isStarred ? "取消收藏" : "收藏文章"}
          aria-pressed={Boolean(article.isStarred)}
          className="relative z-20 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Star className={cn("size-3.5", article.isStarred && "fill-primary text-primary")} />
        </button>
      ) : article.isStarred ? (
        <Star aria-label="已收藏" className="size-3.5 shrink-0 fill-primary text-primary" />
      ) : null}
    </article>
  );
}
