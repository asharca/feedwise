/**
 * Shared Article shape used by the search view and the default reader.
 * Kept narrow — only what the search-results page needs.
 */
export interface Article {
  id: string;
  feedId: string;
  feedTitle: string | null;
  feedIconUrl: string | null;
  title: string | null;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  isRead: boolean;
  isStarred: boolean;
}
