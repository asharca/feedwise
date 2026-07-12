import type { ReaderArticleDetail } from "./types";

/** Append a server page without allowing unstable pagination to duplicate ids. */
export function mergeUniqueArticles<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map((article) => article.id));
  const merged = [...current];
  for (const article of incoming) {
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    merged.push(article);
  }
  return merged;
}

/** Fetch one article's full detail. Returns null on any failure. */
export async function fetchArticleDetail(id: string): Promise<ReaderArticleDetail | null> {
  const res = await fetch(`/api/articles/${id}`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.success ? (data.data as ReaderArticleDetail) : null;
}

/** Persist a read/star change and reject when the server did not commit it. */
export async function patchArticle(
  id: string,
  patch: { isRead?: boolean; isStarred?: boolean },
): Promise<void> {
  const response = await fetch(`/api/articles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
  } | null;
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error ?? "Failed to update article");
  }
}
