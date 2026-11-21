"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Rss, Star } from "lucide-react";
import { getArticleImages } from "@/lib/reader/media";
import { cn, htmlToText, proxyImg } from "@/lib/utils";
import { Highlight, type ArticleCardItem } from "./article-card";

interface Props {
  article: ArticleCardItem;
  active?: boolean;
  onSelect: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  searchQuery?: string;
  displayedAt?: Date | string | null;
}

/**
 * Compact social post item: author/source header, multi-line text snippet,
 * and up to 4 media thumbnails routed through the image proxy.
 */
export function SocialArticleItem({
  article,
  active = false,
  onSelect,
  onStar,
  searchQuery,
  displayedAt,
}: Props) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const timestamp = displayedAt ?? article.publishedAt ?? article.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  const relTime =
    date && !Number.isNaN(date.getTime())
      ? formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
      : null;

  const isRead = Boolean(article.isRead);
  const displayAuthor = article.author?.trim() || article.feedTitle || "未知作者";
  const showSourceSub =
    Boolean(article.author?.trim()) &&
    Boolean(article.feedTitle) &&
    article.author?.trim() !== article.feedTitle;

  const snippet = article.summary ? htmlToText(article.summary).slice(0, 280) : null;
  const images = getArticleImages(article)
    .filter((img) => !failedUrls.has(img.url))
    .slice(0, 4);

  return (
    <article
      data-article-id={article.id}
      data-content-view="social"
      className={cn(
        "group relative flex scroll-mt-8 flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
        active
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border hover:border-foreground/30",
        !active && isRead && "opacity-70",
      )}
    >
      <button
        type="button"
        data-article-open
        aria-current={active ? "true" : undefined}
        aria-label={`阅读：${article.title ?? displayAuthor}`}
        onClick={() => onSelect(article.id)}
        className="absolute inset-0 z-10 rounded-lg outline-none"
      />

      <div className="flex items-center gap-2 pr-8">
        {article.feedIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(article.feedIconUrl, 96)}
            alt=""
            decoding="async"
            className="size-5 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Rss className="size-3" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            {!isRead && (
              <span
                aria-label="未读"
                className="inline-block size-1.5 shrink-0 rounded-full bg-primary"
              />
            )}
            <span className="truncate font-semibold text-foreground">{displayAuthor}</span>
            {showSourceSub && (
              <span className="truncate text-muted-foreground">· {article.feedTitle}</span>
            )}
          </div>
        </div>
        {relTime && <span className="shrink-0 text-[11px] text-muted-foreground">{relTime}</span>}
      </div>

      {article.title && (
        <h3
          className={cn(
            "line-clamp-2 text-sm leading-snug",
            !isRead ? "font-semibold text-foreground" : "font-medium text-foreground/85",
          )}
        >
          <Highlight text={article.title} query={searchQuery} />
        </h3>
      )}

      {snippet && snippet !== article.title && (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          <Highlight text={snippet} query={searchQuery} />
        </p>
      )}

      {images.length > 0 && (
        <div
          className={cn("grid gap-1.5 pt-0.5", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}
        >
          {images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.url}
              src={proxyImg(img.url, 480)}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() =>
                setFailedUrls((prev) => {
                  const next = new Set(prev);
                  next.add(img.url);
                  return next;
                })
              }
              className={cn(
                "w-full rounded-md object-cover transform-gpu backface-hidden",
                images.length === 1 ? "max-h-48" : "h-24",
              )}
            />
          ))}
        </div>
      )}

      {onStar ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStar(article.id, !article.isStarred);
          }}
          aria-label={article.isStarred ? "取消收藏" : "收藏文章"}
          aria-pressed={Boolean(article.isStarred)}
          className={cn(
            "absolute right-1.5 top-1.5 z-20 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-yellow-500",
            article.isStarred && "text-yellow-500",
          )}
        >
          <Star className={cn("size-3.5", article.isStarred && "fill-current")} />
        </button>
      ) : article.isStarred ? (
        <Star
          aria-label="已收藏"
          className="absolute right-2.5 top-2.5 z-20 size-3.5 fill-yellow-400 text-yellow-400"
        />
      ) : null}
    </article>
  );
}
