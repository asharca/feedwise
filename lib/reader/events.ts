/**
 * Window-level events that keep reader pages and the sidebar in sync.
 * Dispatchers and listeners must share these constants — never re-type the
 * strings.
 */
export const UNREAD_DELTA_EVENT = "feedwise:unread-delta";
export const MARK_ALL_READ_EVENT = "feedwise:mark-all-read";
export const SUBSCRIPTIONS_CHANGED_EVENT = "feedwise:subscriptions-changed";

export interface UnreadDeltaDetail {
  feedId: string;
  delta: number;
}

export interface MarkAllReadDetail {
  feedId?: string;
  folderId?: string;
}

export interface SubscriptionsChangedDetail {
  feedId?: string;
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

export function dispatchSubscriptionsChanged(feedId?: string): void {
  window.dispatchEvent(
    new CustomEvent<SubscriptionsChangedDetail>(SUBSCRIPTIONS_CHANGED_EVENT, {
      detail: { feedId },
    }),
  );
}
