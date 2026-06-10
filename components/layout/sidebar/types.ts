export interface Subscription {
  id: string;
  feedId: string;
  title: string | null;
  feedTitle: string | null;
  url: string;
  iconUrl: string | null;
  folderId: string | null;
  unreadCount?: number;
  lastFetchError?: string | null;
  errorCode?: string | null;
  consecutiveFailures?: number | null;
  lastFetchedAt?: string | Date | null;
}

export interface Folder {
  id: string;
  name: string;
  position?: number | null;
}
