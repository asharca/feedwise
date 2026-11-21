import type { ArticleMedia, ContentView, FullContentStatus } from "@/lib/db/schema-types";

export interface ArticleListItem {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  imageUrl: string | null;
  media: ArticleMedia[] | null;
  view: ContentView;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
}

export interface HistoryArticleItem extends ArticleListItem {
  readAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * The article detail shape returned by GET /api/articles/[id], as consumed by
 * the reader pages. Dates are ISO strings (callers convert to Date at the
 * ArticleReader boundary).
 */
export interface ReaderArticleDetail {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl?: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  summary: string | null;
  contentHtml: string | null;
  contentText: string | null;
  imageUrl?: string | null;
  media?: ArticleMedia[] | null;
  view?: ContentView;
  fullContentHtml?: string | null;
  fullContentStatus?: FullContentStatus | null;
  fetchFullText?: boolean;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  aiSummary?: string | null;
  importance?: "high" | "med" | "low" | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
}

export interface RelatedArticle {
  id: string;
  title: string | null;
  url: string | null;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  publishedAt: string | null;
}

export interface TagSummary {
  id: string;
  name: string;
  color: string | null;
  articleCount: number;
}

export interface ArticleListFilter {
  feedId?: string;
  folderId?: string;
  tagId?: string;
  unread?: boolean;
  starred?: boolean;
  since?: string;
  search?: string;
  view?: ContentView;
  limit?: number;
}

export interface FullContentResult {
  status: FullContentStatus;
  html: string | null;
}

export interface SummarizeResult {
  summary: string | null;
  importance: "high" | "med" | "low" | null;
  skipped?: string;
  minChars?: number;
  sourceChars?: number;
}

export interface TagSuggestion {
  name: string;
  existingTagId: string | null;
}
