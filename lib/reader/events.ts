/**
 * Window-level events that sync read-state between the reader pages and the
 * sidebar's unread counters. Dispatchers and listeners must share these
 * constants — never re-type the strings.
 */
export const UNREAD_DELTA_EVENT = "feedwise:unread-delta";
export const MARK_ALL_READ_EVENT = "feedwise:mark-all-read";

export interface UnreadDeltaDetail {
  feedId: string;
  delta: number;
}

export interface MarkAllReadDetail {
  feedId?: string;
  folderId?: string;
}

export function dispatchUnreadDelta(feedId: string, delta: number): void {
  window.dispatchEvent(
    new CustomEvent<UnreadDeltaDetail>(UNREAD_DELTA_EVENT, { detail: { feedId, delta } }),
  );
}

export function dispatchMarkAllRead(feedId?: string, folderId?: string): void {
  window.dispatchEvent(
    new CustomEvent<MarkAllReadDetail>(MARK_ALL_READ_EVENT, { detail: { feedId, folderId } }),
  );
}
