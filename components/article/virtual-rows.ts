import { observeElementRect, type Rect, type Virtualizer } from "@tanstack/react-virtual";
import type { ArticleCardItem } from "./article-card";

export const FALLBACK_VIEWPORT_RECT: Rect = { width: 800, height: 600 };

/**
 * Wraps TanStack Virtual's default ResizeObserver rect observer with a
 * non-zero fallback when layout height is 0 (e.g. JSDOM or pre-layout paint).
 */
export function observeScrollRect<TScrollElement extends Element, TItemElement extends Element>(
  instance: Virtualizer<TScrollElement, TItemElement>,
  cb: (rect: Rect) => void,
) {
  return observeElementRect(instance, (rect) => {
    if (rect.height > 0) {
      cb(rect);
    } else {
      cb({
        width: rect.width > 0 ? rect.width : FALLBACK_VIEWPORT_RECT.width,
        height: FALLBACK_VIEWPORT_RECT.height,
      });
    }
  });
}

export interface DateGroup<T extends ArticleCardItem> {
  key: string;
  label: string;
  rows: T[];
}

export type VirtualRow<T extends ArticleCardItem> =
  | { kind: "header"; key: string; label: string }
  | { kind: "item"; key: string; article: T; index: number }
  | {
      kind: "grid-row";
      key: string;
      items: Array<{ article: T; index: number }>;
      columns: number;
    };

export interface VirtualRowsResult<T extends ArticleCardItem> {
  rows: VirtualRow<T>[];
  /** Maps article id to the virtual row index that contains it. */
  articleRowIndex: Map<string, number>;
}

/**
 * Flatten date-grouped articles into virtualizable rows.
 * - In compact mode (`columns <= 1`), each article is a single `item` row.
 * - In grid mode (`columns > 1`), non-audio articles chunk into rows of `columns`
 *   cards while audio items stay full-width rows for usable inline players.
 */
export function buildDateGroupedVirtualRows<T extends ArticleCardItem>(
  groups: readonly DateGroup<T>[],
  columns: number,
): VirtualRowsResult<T> {
  const rows: VirtualRow<T>[] = [];
  const articleRowIndex = new Map<string, number>();
  const effectiveCols = Math.max(1, columns);
  let itemIndex = 0;

  for (const group of groups) {
    rows.push({ kind: "header", key: `h:${group.key}`, label: group.label });

    if (effectiveCols <= 1) {
      for (const article of group.rows) {
        articleRowIndex.set(article.id, rows.length);
        rows.push({ kind: "item", key: `i:${article.id}`, article, index: itemIndex++ });
      }
      continue;
    }

    let pending: Array<{ article: T; index: number }> = [];
    const flushPending = (groupKey: string) => {
      if (pending.length === 0) return;
      const rowIndex = rows.length;
      for (const entry of pending) {
        articleRowIndex.set(entry.article.id, rowIndex);
      }
      rows.push({
        kind: "grid-row",
        key: `g:${groupKey}:${pending[0].article.id}`,
        items: pending,
        columns: effectiveCols,
      });
      pending = [];
    };

    for (const article of group.rows) {
      if (article.view === "audio") {
        flushPending(group.key);
        articleRowIndex.set(article.id, rows.length);
        rows.push({ kind: "item", key: `i:${article.id}`, article, index: itemIndex++ });
        continue;
      }
      pending.push({ article, index: itemIndex++ });
      if (pending.length === effectiveCols) {
        flushPending(group.key);
      }
    }
    flushPending(group.key);
  }

  return { rows, articleRowIndex };
}

/** Flatten an ungrouped article array into virtual rows (list or grid). */
export function buildFlatVirtualRows<T extends ArticleCardItem>(
  articles: readonly T[],
  columns: number,
): VirtualRowsResult<T> {
  const rows: VirtualRow<T>[] = [];
  const articleRowIndex = new Map<string, number>();
  const effectiveCols = Math.max(1, columns);

  if (effectiveCols <= 1) {
    articles.forEach((article, index) => {
      articleRowIndex.set(article.id, rows.length);
      rows.push({ kind: "item", key: `i:${article.id}`, article, index });
    });
    return { rows, articleRowIndex };
  }

  let pending: Array<{ article: T; index: number }> = [];
  const flushPending = () => {
    if (pending.length === 0) return;
    const rowIndex = rows.length;
    for (const entry of pending) {
      articleRowIndex.set(entry.article.id, rowIndex);
    }
    rows.push({
      kind: "grid-row",
      key: `g:${pending[0].article.id}`,
      items: pending,
      columns: effectiveCols,
    });
    pending = [];
  };

  articles.forEach((article, index) => {
    if (article.view === "audio") {
      flushPending();
      articleRowIndex.set(article.id, rows.length);
      rows.push({ kind: "item", key: `i:${article.id}`, article, index });
      return;
    }
    pending.push({ article, index });
    if (pending.length === effectiveCols) flushPending();
  });
  flushPending();

  return { rows, articleRowIndex };
}

/** Heuristic initial row height before ResizeObserver/measureElement refines it. */
export function estimateVirtualRowSize<T extends ArticleCardItem>(row: VirtualRow<T>): number {
  if (row.kind === "header") return 34;
  if (row.kind === "grid-row") {
    const firstView = row.items[0]?.article.view;
    if (firstView === "picture") return 280;
    if (firstView === "video") return 260;
    if (firstView === "social") return 220;
    return 252;
  }
  const view = row.article.view;
  if (view === "audio") return 148;
  if (view === "video") return 116;
  if (view === "picture") return 230;
  if (view === "social") return 176;
  return 108;
}
