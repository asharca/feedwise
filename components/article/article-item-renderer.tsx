"use client";

import { ArticleCard, type ArticleCardItem } from "./article-card";
import { ArticleRow } from "./article-row";
import { AudioArticleItem } from "./audio-article-item";
import { PictureArticleItem } from "./picture-article-item";
import { SocialArticleItem } from "./social-article-item";
import { VideoArticleItem } from "./video-article-item";

export interface ArticleItemRendererProps {
  article: ArticleCardItem;
  mode: "row" | "card";
  active?: boolean;
  onSelect: (id: string) => void;
  onStar?: (id: string, starred: boolean) => void;
  searchQuery?: string;
  displayedAt?: Date | string | null;
}

/**
 * Renders an article according to its own `view` (`article` | `social` |
 * `picture` | `video` | `audio`), so mixed lists display each item natively.
 */
export function ArticleItemRenderer({
  article,
  mode,
  active = false,
  onSelect,
  onStar,
  searchQuery,
  displayedAt,
}: ArticleItemRendererProps) {
  const view = article.view ?? "article";

  switch (view) {
    case "social":
      return (
        <SocialArticleItem
          article={article}
          active={active}
          onSelect={onSelect}
          onStar={onStar}
          searchQuery={searchQuery}
          displayedAt={displayedAt}
        />
      );
    case "picture":
      return (
        <PictureArticleItem
          article={article}
          active={active}
          onSelect={onSelect}
          onStar={onStar}
          searchQuery={searchQuery}
          displayedAt={displayedAt}
          compact={mode === "row"}
        />
      );
    case "video":
      return (
        <VideoArticleItem
          article={article}
          mode={mode}
          active={active}
          onSelect={onSelect}
          onStar={onStar}
          searchQuery={searchQuery}
          displayedAt={displayedAt}
        />
      );
    case "audio":
      return (
        <AudioArticleItem
          article={article}
          active={active}
          onSelect={onSelect}
          onStar={onStar}
          searchQuery={searchQuery}
          displayedAt={displayedAt}
        />
      );
    case "article":
    default:
      return mode === "card" ? (
        <ArticleCard
          article={article}
          active={active}
          onSelect={onSelect}
          onStar={onStar}
          searchQuery={searchQuery}
          displayedAt={displayedAt}
        />
      ) : (
        <ArticleRow
          article={article}
          active={active}
          onSelect={onSelect}
          onStar={onStar}
          searchQuery={searchQuery}
          displayedAt={displayedAt}
        />
      );
  }
}
