"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Play, Rss, Star } from "lucide-react";
import { formatDuration, getArticleImages, getFirstVideoMedia } from "@/lib/reader/media";
import { cn, htmlToText, proxyImg } from "@/lib/utils";
import { Highlight, type ArticleCardItem } from "./article-card";

interface Props {
  article: ArticleCardItem;
  mode?: "row" | "card";
  active?: boolean;
  onSelect: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  searchQuery?: string;
  displayedAt?: Date | string | null;
}

/**
 * Video item:
 * - `card` mode (grid): vertical card with full-card-width 16:9 thumbnail, play badge, and duration.
 * - `row` mode (mixed list / compact pane): horizontal row with fixed 160px 16:9 thumbnail + meta/title.
 */
export function VideoArticleItem({
  article,
  mode = "card",
  active = false,
  onSelect,
  onStar,
  searchQuery,
  displayedAt,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const video = getFirstVideoMedia(article.media);
  const fallbackImage = getArticleImages(article)[0]?.url ?? null;
  const posterUrl = video?.previewUrl || article.imageUrl || fallbackImage;
  const durationLabel = formatDuration(video?.duration);
  const isRead = Boolean(article.isRead);

  const timestamp = displayedAt ?? article.publishedAt ?? article.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  const relTime =
    date && !Number.isNaN(date.getTime())
      ? formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
      : null;

  if (mode === "row") {
    const excerpt = article.summary ? htmlToText(article.summary) : undefined;
    return (
      <article
        data-article-id={article.id}
        data-content-view="video"
        data-layout="row"
        className={cn(
          "group relative flex scroll-mt-8 items-center gap-3 rounded-md py-2.5 pl-3 pr-2 text-left transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring",
          active ? "bg-primary/10" : "hover:bg-accent/60",
        )}
      >
        <button
          type="button"
          data-article-open
          aria-current={active ? "true" : undefined}
          aria-label={`观看视频：${article.title ?? "无标题"}`}
          onClick={() => onSelect(article.id)}
          className="absolute inset-0 z-10 rounded-md outline-none"
        />

        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-muted sm:w-40">
          {posterUrl && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(posterUrl, 480)}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="size-full object-cover transform-gpu backface-hidden"
            />
          ) : (
            <div className="size-full bg-gradient-to-br from-muted to-muted-foreground/15" />
          )}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15 transition-colors group-hover:bg-black/25"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-black/70 text-white shadow">
              <Play className="ml-0.5 size-3.5 fill-current" />
            </span>
          </div>

          {durationLabel && (
            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
              {durationLabel}
            </span>
          )}
        </div>

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
            {relTime && <span className="ml-auto shrink-0">{relTime}</span>}
          </div>
          <h3
            className={cn(
              "line-clamp-2 text-[15px] font-semibold leading-snug",
              isRead && !active && "text-muted-foreground",
            )}
          >
            {!isRead && (
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

        {onStar ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStar(article.id, !article.isStarred);
            }}
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

  return (
    <article
      data-article-id={article.id}
      data-content-view="video"
      data-layout="card"
      className={cn(
        "group relative flex w-full scroll-mt-8 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
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
        aria-label={`观看视频：${article.title ?? "无标题"}`}
        onClick={() => onSelect(article.id)}
        className="absolute inset-0 z-10 rounded-lg outline-none"
      />

      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {posterUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyImg(posterUrl, 480)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="size-full object-cover transform-gpu backface-hidden"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-muted to-muted-foreground/15" />
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15 transition-colors group-hover:bg-black/25"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-black/70 text-white shadow-md">
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </div>

        {durationLabel && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {durationLabel}
          </span>
        )}
      </div>

      <div className="pointer-events-none flex flex-col gap-1 p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {!isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
          {article.feedIconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImg(article.feedIconUrl, 96)}
              alt=""
              decoding="async"
              className="size-3 shrink-0 rounded-sm"
            />
          )}
          <span className="truncate font-medium">{article.feedTitle ?? "未知来源"}</span>
          {relTime && <span className="ml-auto shrink-0">{relTime}</span>}
        </div>
        <h4
          className={cn(
            "line-clamp-2 text-sm leading-snug",
            !isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80",
          )}
        >
          <Highlight text={article.title ?? "无标题"} query={searchQuery} />
        </h4>
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
        <Star className="absolute right-2.5 top-2.5 z-20 size-3.5 fill-yellow-400 text-yellow-400" />
      ) : null}
    </article>
  );
}
