import type { ReaderArticleDetail } from "./types";

/** Fetch one article's full detail. Returns null on any failure. */
export async function fetchArticleDetail(id: string): Promise<ReaderArticleDetail | null> {
  const res = await fetch(`/api/articles/${id}`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.success ? (data.data as ReaderArticleDetail) : null;
}

/**
 * Persist a read/star change. Best-effort: the reader UIs update
 * optimistically and a lost PATCH self-heals on the next list fetch.
 */
export async function patchArticle(
  id: string,
  patch: { isRead?: boolean; isStarred?: boolean },
): Promise<void> {
  await fetch(`/api/articles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {});
}
