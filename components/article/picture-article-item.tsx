"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Images, Star } from "lucide-react";
import { getArticleImages } from "@/lib/reader/media";
import { cn, proxyImg } from "@/lib/utils";
import { Highlight, type ArticleCardItem } from "./article-card";

interface Props {
  article: ArticleCardItem;
  active?: boolean;
  onSelect: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  searchQuery?: string;
  displayedAt?: Date | string | null;
  /** Compact mode uses a smaller fixed-height image tile for narrow side panes. */
  compact?: boolean;
}

/**
 * Image-first card for the `picture` content view. Respects media aspect ratio
 * when dimensions are available for a masonry-like rhythm while routing every
 * image through `/api/image-proxy` with width tiers.
 */
export function PictureArticleItem({
  article,
  active = false,
  onSelect,
  onStar,
  searchQuery,
  displayedAt,
  compact = false,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const images = getArticleImages(article);
  const primary = images[0] ?? null;
  const hasImage = Boolean(primary?.url) && !imgFailed;
  const isRead = Boolean(article.isRead);

  const timestamp = displayedAt ?? article.publishedAt ?? article.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  const relTime =
    date && !Number.isNaN(date.getTime())
      ? formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
      : null;

  // Clamp known aspect ratio so ultra-tall or ultra-wide images stay balanced in virtual rows.
  const rawRatio =
    primary?.width && primary?.height && primary.height > 0
      ? primary.width / primary.height
      : 4 / 3;
  const aspectRatio = Math.min(1.5, Math.max(0.75, rawRatio));

  return (
    <article
      data-article-id={article.id}
      data-content-view="picture"
      className={cn(
        "group relative flex w-full scroll-mt-8 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
        active
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border hover:border-foreground/30",
        !active && isRead && "opacity-75",
      )}
    >
      <button
        type="button"
        data-article-open
        aria-current={active ? "true" : undefined}
        aria-label={`查看图片：${article.title ?? "无标题"}`}
        onClick={() => onSelect(article.id)}
        className="absolute inset-0 z-10 rounded-lg outline-none"
      />

      {!isRead && !active && (
        <span className="absolute left-2.5 top-2.5 z-20 size-1.5 rounded-full bg-primary shadow" />
      )}

      {images.length > 1 && (
        <span className="pointer-events-none absolute left-2 bottom-14 z-20 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Images className="size-3" aria-hidden="true" />
          {images.length}
        </span>
      )}

      {hasImage ? (
        <div
          className={cn("w-full overflow-hidden bg-muted", compact && "h-40")}
          style={compact ? undefined : { aspectRatio: String(aspectRatio) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyImg(primary!.url, 480)}
            alt={article.title ?? ""}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="size-full object-cover transform-gpu backface-hidden transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div className="flex h-36 w-full items-center justify-center bg-muted/60 text-xs text-muted-foreground">
          暂无预览图
        </div>
      )}

      <div className="pointer-events-none flex flex-col gap-1 p-2.5">
        <h4
          className={cn(
            "line-clamp-1 text-xs leading-snug",
            !isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80",
          )}
        >
          <Highlight text={article.title ?? "无标题"} query={searchQuery} />
        </h4>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {article.feedIconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(article.feedIconUrl, 96)}
              alt=""
              decoding="async"
              className="size-3 shrink-0 rounded-sm"
            />
          )}
          <span className="truncate">{article.feedTitle ?? "未知来源"}</span>
          {relTime && <span className="ml-auto shrink-0">{relTime}</span>}
        </div>
      </div>

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
            "absolute right-1.5 top-1.5 z-20 inline-flex size-8 items-center justify-center rounded-md bg-background/85 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-yellow-500",
            article.isStarred && "text-yellow-500",
          )}
        >
          <Star className={cn("size-4", article.isStarred && "fill-current")} />
        </button>
      ) : article.isStarred ? (
        <Star className="absolute right-2.5 top-2.5 z-20 size-3.5 fill-yellow-400 text-yellow-400 drop-shadow" />
      ) : null}
    </article>
  );
}
