import type { InfiniteData } from "@tanstack/react-query";
import { CONTENT_VIEWS, type ContentView } from "@/lib/db/schema-types";
import type { ArticleListFilter, CursorPage } from "./types";

export const DEFAULT_ARTICLE_PAGE_SIZE = 50;

/** Narrow a query parameter value to a valid ContentView, or undefined. */
export function parseContentView(value: string | null | undefined): ContentView | undefined {
  if (!value) return undefined;
  return CONTENT_VIEWS.find((v) => v === value);
}

/** Build the cursor-paginated GET /api/articles URL from filter params. */
export function buildArticlesUrl(filter: ArticleListFilter, cursor?: string): string {
  const params = new URLSearchParams();
  if (filter.feedId) params.set("feedId", filter.feedId);
  if (filter.folderId) params.set("folderId", filter.folderId);
  if (filter.tagId) params.set("tag", filter.tagId);
  if (filter.unread) params.set("unread", "true");
  if (filter.starred) params.set("starred", "true");
  if (filter.since) params.set("since", filter.since);
  if (filter.search) params.set("search", filter.search);
  if (filter.view) params.set("view", filter.view);
  params.set("limit", String(filter.limit ?? DEFAULT_ARTICLE_PAGE_SIZE));
  if (cursor) params.set("cursor", cursor);
  return `/api/articles?${params.toString()}`;
}

/** Build the cursor-paginated GET /api/articles/history URL. */
export function buildHistoryUrl(
  search?: string,
  cursor?: string,
  limit = DEFAULT_ARTICLE_PAGE_SIZE,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (search) params.set("search", search);
  if (cursor) params.set("cursor", cursor);
  return `/api/articles/history?${params.toString()}`;
}

/** Flatten paginated cursor pages into a deduplicated ordered array. */
export function flattenArticlePages<T extends { id: string }>(
  data: InfiniteData<CursorPage<T>> | undefined,
): T[] {
  if (!data) return [];
  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

/** Immutably patch one article across all cached pages of an infinite query. */
export function updateArticleInPages<T extends { id: string }>(
  data: InfiniteData<CursorPage<T>> | undefined,
  id: string,
  patch: Partial<T>,
): InfiniteData<CursorPage<T>> | undefined {
  if (!data || !Array.isArray(data.pages)) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((item) => {
      if (item.id !== id) return item;
      pageChanged = true;
      changed = true;
      return { ...item, ...patch };
    });
    return pageChanged ? { ...page, items } : page;
  });
  return changed ? { ...data, pages } : data;
}

/** Immutably mark every article read across all cached pages of an infinite query. */
export function markAllInPagesRead<T extends { id: string; isRead: boolean }>(
  data: InfiniteData<CursorPage<T>> | undefined,
): InfiniteData<CursorPage<T>> | undefined {
  if (!data || !Array.isArray(data.pages)) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((item) => {
      if (item.isRead) return item;
      pageChanged = true;
      changed = true;
      return { ...item, isRead: true };
    });
    return pageChanged ? { ...page, items } : page;
  });
  return changed ? { ...data, pages } : data;
}
