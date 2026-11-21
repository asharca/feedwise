/**
 * TanStack Query keys for every client data domain. Invalidate by the root
 * key (e.g. `queryKeys.articles.all`) to refresh a whole domain.
 *
 * - `articles` = lists/history/grouped views (refreshed on new-article events)
 * - `article`  = single-article detail and its sub-resources
 */
export const queryKeys = {
  articles: {
    all: ["articles"] as const,
    list: (filter: Record<string, unknown>) => ["articles", "list", filter] as const,
    history: (filter: Record<string, unknown>) => ["articles", "history", filter] as const,
    grouped: () => ["articles", "grouped"] as const,
  },
  article: {
    all: ["article"] as const,
    detail: (id: string) => ["article", id] as const,
    related: (id: string) => ["article", id, "related"] as const,
    tagSuggestions: (id: string) => ["article", id, "tag-suggestions"] as const,
  },
  feeds: {
    all: ["feeds"] as const,
    list: () => ["feeds", "list"] as const,
  },
  folders: {
    all: ["folders"] as const,
  },
  tags: {
    all: ["tags"] as const,
  },
  hot: {
    all: ["hot"] as const,
    boards: (category: string) => ["hot", "boards", category] as const,
    trending: () => ["hot", "trending"] as const,
  },
  search: {
    all: ["search"] as const,
    query: (params: Record<string, unknown>) => ["search", params] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    stats: (params: Record<string, unknown>) => ["dashboard", "stats", params] as const,
    timeline: (params: Record<string, unknown>) => ["dashboard", "timeline", params] as const,
  },
  discover: {
    all: ["discover"] as const,
  },
  settings: {
    all: ["settings"] as const,
    general: () => ["settings", "general"] as const,
    account: () => ["settings", "account"] as const,
    email: () => ["settings", "email"] as const,
    emailHistory: () => ["settings", "email", "history"] as const,
    llm: () => ["settings", "llm"] as const,
    apiAccess: () => ["settings", "api-access"] as const,
  },
  rules: {
    all: ["rules"] as const,
  },
  notificationChannels: {
    all: ["notification-channels"] as const,
  },
  shareFeeds: {
    all: ["share-feeds"] as const,
  },
  push: {
    vapidKey: () => ["push", "vapid-key"] as const,
  },
} as const;
