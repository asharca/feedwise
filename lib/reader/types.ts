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
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
  aiSummary?: string | null;
  importance?: "high" | "med" | "low" | null;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
}
