"use client";

import { formatDistanceToNow } from "date-fns";
import { Star, Inbox } from "lucide-react";
import { cn, proxyImg } from "@/lib/utils";

interface Article {
  id: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary: string | null;
  imageUrl?: string | null;
  publishedAt: Date | null;
  isRead: boolean;
  isStarred: boolean;
}

interface ArticleListProps {
  articles: Article[];
  activeId?: string;
  onSelect: (id: string) => void;
  onStar: (id: string, starred: boolean) => void;
  compact?: boolean;
}

export function ArticleList({ articles, activeId, onSelect, onStar, compact = false }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8">
        <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center">
          <Inbox className="size-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm">No articles</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="overflow-y-auto h-full scrollbar-thin">
        <div className="flex flex-col gap-px p-1.5">
          {articles.map((article) => (
            <div
              key={article.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(article.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(article.id); }
              }}
              className={cn(
                "group relative flex gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-100",
                activeId === article.id
                  ? "bg-accent"
                  : "hover:bg-accent/50",
                article.isRead && activeId !== article.id && "opacity-55"
              )}
            >
              {!article.isRead && (
                <span className="absolute left-1 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-primary shrink-0" />
              )}
              <div className="flex-1 min-w-0 pl-1">
                <div className="flex items-center gap-1 mb-0.5">
                  {article.feedIconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(article.feedIconUrl)} alt="" className="size-3 rounded-sm shrink-0" />
                  )}
                  <span className="text-[10px] text-muted-foreground/70 truncate">
                    {article.feedTitle ?? "Unknown"}
                  </span>
                  {article.publishedAt && (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-auto">
                      {formatDistanceToNow(article.publishedAt, { addSuffix: false })}
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-[12px] leading-snug line-clamp-2",
                  !article.isRead ? "font-semibold" : "font-normal text-foreground/75"
                )}>
                  {article.title ?? "(No title)"}
                </p>
              </div>
              {article.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(article.imageUrl)} alt="" className="size-10 rounded-md object-cover shrink-0 self-center" />
              )}
              {article.isStarred && (
                <Star className="absolute top-2 right-2 size-2.5 fill-yellow-400 text-yellow-400" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full scrollbar-thin">
      <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 auto-rows-min">
        {articles.map((article) => {
          const excerpt = article.summary
            ? article.summary.replace(/<[^>]*>/g, "").slice(0, 140)
            : null;

          return (
            <div
              key={article.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(article.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(article.id);
                }
              }}
              className={cn(
                "group relative flex flex-col rounded-xl overflow-hidden border bg-card",
                "cursor-pointer transition-all duration-150",
                "hover:shadow-md hover:border-border/80 hover:-translate-y-0.5",
                activeId === article.id
                  ? "border-primary/40 ring-1 ring-primary/30 shadow-sm"
                  : "border-border/50",
                article.isRead && activeId !== article.id && "opacity-55"
              )}
            >
              {article.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxyImg(article.imageUrl)} alt="" className="w-full h-32 object-cover shrink-0" />
              )}
              <div className="flex flex-col flex-1 p-3">
                <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
                  {article.feedIconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxyImg(article.feedIconUrl)} alt="" className="size-3 rounded-sm shrink-0" />
                  )}
                  <span className="text-[10px] text-muted-foreground/80 font-medium truncate">
                    {article.feedTitle ?? "Unknown"}
                  </span>
                  {article.publishedAt && (
                    <>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">·</span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {formatDistanceToNow(article.publishedAt, { addSuffix: true })}
                      </span>
                    </>
                  )}
                </div>
                <p className={cn(
                  "text-[13px] leading-snug line-clamp-3 mb-1",
                  !article.isRead ? "font-semibold text-foreground" : "font-normal text-foreground/75"
                )}>
                  {article.title ?? "(No title)"}
                </p>
                {excerpt && (
                  <p className="text-[11px] text-muted-foreground/65 line-clamp-2 leading-relaxed mt-auto pt-1">
                    {excerpt}
                  </p>
                )}
              </div>
              {!article.isRead && (
                <span className="absolute top-2.5 left-2.5 size-1.5 rounded-full bg-primary" />
              )}
              {article.isStarred ? (
                <Star className="absolute top-2.5 right-2.5 size-3 fill-yellow-400 text-yellow-400" />
              ) : (
                <button
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-md hover:bg-accent"
                  onClick={(e) => { e.stopPropagation(); onStar(article.id, true); }}
                >
                  <Star className="size-3 text-muted-foreground/40 hover:text-yellow-400 transition-colors" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
