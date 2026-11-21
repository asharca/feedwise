import { apiFetch } from "@/lib/query/api";
import { buildArticlesUrl, buildHistoryUrl } from "./article-cache";
import type {
  ArticleListFilter,
  ArticleListItem,
  CursorPage,
  FullContentResult,
  HistoryArticleItem,
  ReaderArticleDetail,
  RelatedArticle,
  SummarizeResult,
  TagSuggestion,
  TagSummary,
} from "./types";

export function fetchArticlesPage(
  filter: ArticleListFilter,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CursorPage<ArticleListItem>> {
  return apiFetch<CursorPage<ArticleListItem>>(buildArticlesUrl(filter, cursor), { signal });
}

export function fetchHistoryPage(
  search?: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CursorPage<HistoryArticleItem>> {
  return apiFetch<CursorPage<HistoryArticleItem>>(buildHistoryUrl(search, cursor), { signal });
}

export function fetchArticleDetail(id: string, signal?: AbortSignal): Promise<ReaderArticleDetail> {
  return apiFetch<ReaderArticleDetail>(`/api/articles/${id}`, { signal });
}

export function patchArticle(
  id: string,
  patch: { isRead?: boolean; isStarred?: boolean; readProgress?: number },
): Promise<void> {
  return apiFetch<void>(`/api/articles/${id}`, {
    method: "PATCH",
    json: patch,
  });
}

export function markAllArticlesRead(scope: { feedId?: string; folderId?: string }): Promise<void> {
  const params = new URLSearchParams();
  if (scope.feedId) params.set("feedId", scope.feedId);
  if (scope.folderId) params.set("folderId", scope.folderId);
  const qs = params.toString();
  return apiFetch<void>(qs ? `/api/articles/mark-all-read?${qs}` : "/api/articles/mark-all-read", {
    method: "POST",
  });
}

export function fetchFullContent(id: string): Promise<FullContentResult> {
  return apiFetch<FullContentResult>(`/api/articles/${id}/full-content`, {
    method: "POST",
  });
}

export function fetchRelatedArticles(id: string, signal?: AbortSignal): Promise<RelatedArticle[]> {
  return apiFetch<RelatedArticle[]>(`/api/articles/${id}/related`, { signal });
}

export function fetchTags(signal?: AbortSignal): Promise<TagSummary[]> {
  return apiFetch<TagSummary[]>("/api/tags", { signal });
}

export function summarizeArticle(id: string): Promise<SummarizeResult> {
  return apiFetch<SummarizeResult>(`/api/articles/${id}/summarize`, {
    method: "POST",
  });
}

export function suggestArticleTags(id: string): Promise<{ suggestions: TagSuggestion[] }> {
  return apiFetch<{ suggestions: TagSuggestion[] }>(`/api/articles/${id}/tag-suggestions`, {
    method: "POST",
  });
}

export function addArticleTag(id: string, name: string): Promise<{ tagId: string; name: string }> {
  return apiFetch<{ tagId: string; name: string }>(`/api/articles/${id}/tags`, {
    method: "POST",
    json: { name },
  });
}

export function removeArticleTag(id: string, tagId: string): Promise<void> {
  return apiFetch<void>(`/api/articles/${id}/tags/${tagId}`, {
    method: "DELETE",
  });
}
