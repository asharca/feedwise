"use client";

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Headphones, Star } from "lucide-react";
import { formatDuration, getFirstAudioMedia } from "@/lib/reader/media";
import { cn, proxyImg } from "@/lib/utils";
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
 * Audio item row with an inline `<audio controls preload="none">` player for
 * the first audio enclosure.
 */
export function AudioArticleItem({
  article,
  active = false,
  onSelect,
  onStar,
  searchQuery,
  displayedAt,
}: Props) {
  const audio = getFirstAudioMedia(article.media);
  const durationLabel = formatDuration(audio?.duration);
  const isRead = Boolean(article.isRead);

  const timestamp = displayedAt ?? article.publishedAt ?? article.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  const relTime =
    date && !Number.isNaN(date.getTime())
      ? formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
      : null;

  return (
    <article
      data-article-id={article.id}
      data-content-view="audio"
      className={cn(
        "group relative flex scroll-mt-8 flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
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
        aria-label={`收听：${article.title ?? "无标题"}`}
        onClick={() => onSelect(article.id)}
        className="absolute inset-0 z-10 rounded-lg outline-none"
      />

      <div className="flex items-start gap-2.5 pr-8">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Headphones className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
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
            {durationLabel && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                {durationLabel}
              </span>
            )}
            {relTime && <span className="ml-auto shrink-0">{relTime}</span>}
          </div>
          <h3
            className={cn(
              "mt-1 line-clamp-2 text-sm leading-snug",
              !isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80",
            )}
          >
            <Highlight text={article.title ?? "无标题"} query={searchQuery} />
          </h3>
        </div>
      </div>

      {audio && (
        <div
          className="relative z-20"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <audio
            controls
            preload="none"
            src={audio.url}
            className="h-9 w-full"
            aria-label={`播放音频：${article.title ?? "音频"}`}
          />
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
