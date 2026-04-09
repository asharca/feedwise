"use client";

import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

function FeedIcon({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="size-3.5 rounded-sm shrink-0" />
    );
  }
  return null;
}

export function ArticleList({ articles, activeId, onSelect, onStar }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-3 p-8">
        <div className="size-12 rounded-2xl bg-muted flex items-center justify-center">
          <Star className="size-5 text-muted-foreground/50" />
        </div>
        <p>No articles yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto h-full scrollbar-thin p-2">
      {articles.map((article) => {
        const isActive = activeId === article.id;
        const excerpt = article.summary
          ? article.summary.replace(/<[^>]*>/g, "").slice(0, 120)
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
              "w-full text-left px-3 py-3 rounded-xl transition-all duration-150 relative group cursor-pointer",
              isActive
                ? "bg-accent shadow-sm"
                : "hover:bg-accent/50",
              article.isRead && !isActive && "opacity-55"
            )}
          >
            <div className="flex gap-3">
              {/* Text content */}
              <div className="flex-1 min-w-0">
                {/* Feed name + time */}
                <div className="flex items-center gap-1.5 mb-1">
                  <FeedIcon url={article.feedIconUrl} name={article.feedTitle ?? ""} />
                  <span className="text-[11px] text-muted-foreground truncate">
                    {article.feedTitle ?? "Unknown"}
                  </span>
                  {article.publishedAt && (
                    <>
                      <span className="text-[11px] text-muted-foreground/50">·</span>
                      <span className="text-[11px] text-muted-foreground/70 shrink-0">
                        {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                      </span>
                    </>
                  )}
                </div>

                {/* Title */}
                <p
                  className={cn(
                    "text-[13px] leading-snug line-clamp-2",
                    !article.isRead ? "font-semibold" : "font-normal"
                  )}
                >
                  {article.title ?? "(No title)"}
                </p>

                {/* Excerpt */}
                {excerpt && (
                  <p className="text-[12px] text-muted-foreground/70 mt-0.5 line-clamp-2 leading-relaxed">
                    {excerpt}
                  </p>
                )}
              </div>

              {/* Thumbnail */}
              {article.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.imageUrl}
                  alt=""
                  className="size-16 rounded-lg object-cover shrink-0 mt-1"
                />
              )}
            </div>

            {/* Star indicator */}
            {article.isStarred && (
              <Star className="absolute top-3 right-2.5 size-3 fill-yellow-400 text-yellow-400" />
            )}

            {/* Unread dot */}
            {!article.isRead && (
              <span className="absolute left-1 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-primary" />
            )}

            {/* Hover star action */}
            {!article.isStarred && (
              <button
                className="absolute top-3 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onStar(article.id, true);
                }}
              >
                <Star className="size-3 text-muted-foreground/40 hover:text-yellow-400 transition-colors" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
