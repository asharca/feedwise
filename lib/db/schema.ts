import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
  bigint,
  serial,
  bigserial,
  doublePrecision,
  jsonb,
  unique,
  index,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  ArticleMedia,
  ContentView,
  FeedSourceType,
  FullContentStatus,
  HtmlSourceConfig,
  NotificationChannelType,
  RuleAction,
  RuleCondition,
  RuleMatchMode,
  RuleScope,
  ShareFeedFilter,
} from "./schema-types";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ─── Users (id is text — Better Auth generates non-UUID string IDs) ──
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Sessions (better-auth) ───────────────────────────────────
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Folders ──────────────────────────────────────────────────
export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable integer id for client APIs (Fever groups). */
    seq: serial("seq").notNull().unique(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id),
    position: integer("position").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.name)],
);

// ─── Feeds (global) ───────────────────────────────────────────
export const feeds = pgTable(
  "feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable integer id for client APIs (Fever feeds). */
    seq: serial("seq").notNull().unique(),
    url: text("url").notNull().unique(),
    title: varchar("title", { length: 500 }),
    description: text("description"),
    siteUrl: text("site_url"),
    iconUrl: text("icon_url"),
    feedType: varchar("feed_type", { length: 20 }).$type<"rss" | "atom" | "json">(),
    sourceType: varchar("source_type", { length: 10 })
      .$type<FeedSourceType>()
      .notNull()
      .default("rss"),
    /** Only for sourceType = "html". */
    sourceConfig: jsonb("source_config").$type<HtmlSourceConfig>(),
    /** Detected presentation; subscriptions.view overrides per user. */
    defaultView: varchar("default_view", { length: 10 }).$type<ContentView>(),
    lastFetchedAt: timestamp("last_fetched_at"),
    /** Scheduler polls feeds whose next_fetch_at is null or past. */
    nextFetchAt: timestamp("next_fetch_at"),
    lastFetchError: text("last_fetch_error"),
    errorCode: varchar("error_code", { length: 30 }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /** Current adaptive polling interval. */
    fetchIntervalMinutes: integer("fetch_interval_minutes").default(60),
    etag: varchar("etag", { length: 255 }),
    lastModified: varchar("last_modified", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("feeds_next_fetch_idx").on(t.nextFetchAt)],
);

// ─── Subscriptions (user ↔ feed) ──────────────────────────────
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    feedId: uuid("feed_id")
      .references(() => feeds.id, { onDelete: "cascade" })
      .notNull(),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    customTitle: varchar("custom_title", { length: 500 }),
    /** Null = use feeds.default_view (falls back to "article"). */
    view: varchar("view", { length: 10 }).$type<ContentView>(),
    /** Fetch the original page's readable content for new articles. */
    fetchFullText: boolean("fetch_full_text").notNull().default(false),

    position: integer("position").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.feedId)],
);

// ─── Articles ─────────────────────────────────────────────────
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable 64-bit item id for client APIs (Google Reader / Fever). */
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    feedId: uuid("feed_id")
      .references(() => feeds.id, { onDelete: "cascade" })
      .notNull(),
    guid: text("guid").notNull(),
    url: text("url"),
    title: text("title"),
    author: varchar("author", { length: 255 }),
    contentHtml: text("content_html"),
    contentText: text("content_text"),
    summary: text("summary"),
    aiSummary: text("ai_summary"),
    importance: varchar("importance", { length: 6 }).$type<"high" | "med" | "low">(),
    imageUrl: text("image_url"),
    media: jsonb("media").$type<ArticleMedia[]>(),
    /** 64-bit SimHash of title + text for near-duplicate detection. Never serialize directly (BigInt). */
    simhash: bigint("simhash", { mode: "bigint" }),
    /** Readability-extracted content of the original page. */
    fullContentHtml: text("full_content_html"),
    fullContentStatus: varchar("full_content_status", { length: 10 }).$type<FullContentStatus>(),
    fullContentFetchedAt: timestamp("full_content_fetched_at"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Keyset pagination key. */
    sortAt: timestamp("sort_at")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(published_at, created_at)`),
    /** CJK-bigram aware full-text document; see feedwise_search_text() in migrations. */
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple'::regconfig, feedwise_search_text(coalesce(title, ''))), 'A') || setweight(to_tsvector('simple'::regconfig, feedwise_search_text(coalesce(ai_summary, '') || ' ' || coalesce(summary, '') || ' ' || left(coalesce(content_text, ''), 20000))), 'B')`,
    ),
  },
  (t) => [
    unique().on(t.feedId, t.guid),
    index("articles_feed_published_idx").on(t.feedId, t.publishedAt),
    index("articles_feed_sort_idx").on(t.feedId, t.sortAt.desc(), t.id.desc()),
    index("articles_sort_idx").on(t.sortAt),
    index("articles_search_tsv_idx").using("gin", t.searchTsv),
  ],
);

// ─── User-Article State ───────────────────────────────────────
export const userArticles = pgTable(
  "user_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    articleId: uuid("article_id")
      .references(() => articles.id, { onDelete: "cascade" })
      .notNull(),
    isRead: boolean("is_read").default(false),
    isStarred: boolean("is_starred").default(false),
    readAt: timestamp("read_at"),
    readProgress: real("read_progress").default(0),
    /** Set by "hide" rule actions; hidden articles are excluded from lists and counts. */
    isHidden: boolean("is_hidden").notNull().default(false),
  },
  (t) => [
    unique().on(t.userId, t.articleId),
    index("user_articles_unread_idx").on(t.userId, t.isRead),
  ],
);

// ─── Tags ─────────────────────────────────────────────────────
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    color: varchar("color", { length: 7 }),
  },
  (t) => [unique().on(t.userId, t.name)],
);

export const articleTags = pgTable(
  "article_tags",
  {
    articleId: uuid("article_id")
      .references(() => articles.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
    source: varchar("source", { length: 10 }).$type<"user">().default("user"),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

// ─── Email Subscriptions ──────────────────────────────────────────
export const emailSubscriptions = pgTable("email_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  enabled: boolean("enabled").notNull().default(false),
  sendTime: varchar("send_time", { length: 5 }).default("08:00"),
  frequency: varchar("frequency", { length: 10 }).$type<"daily" | "weekly">().default("daily"),
  cronExpression: varchar("cron_expression", { length: 100 }),
  nextScheduledAt: timestamp("next_scheduled_at"),
  lastSentAt: timestamp("last_sent_at"),
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: varchar("smtp_user", { length: 255 }),
  smtpPass: text("smtp_pass"),
  smtpFrom: varchar("smtp_from", { length: 255 }),
  emailProvider: varchar("email_provider", { length: 20 }),
  emailApiKey: text("email_api_key"),
  llmEnabled: boolean("llm_enabled").notNull().default(false),
  llmBaseUrl: varchar("llm_base_url", { length: 500 }),
  llmApiKey: text("llm_api_key"),
  llmModel: varchar("llm_model", { length: 100 }),
  llmFormat: varchar("llm_format", { length: 20 }).default("openai"),
  autoSummarize: boolean("auto_summarize").notNull().default(true),
  autoTag: boolean("auto_tag").notNull().default(false),
  autoSaveOnClick: boolean("auto_save_on_click").notNull().default(false),
  markReadOnClick: boolean("mark_read_on_click").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User's selected tags for email delivery
export const emailSubscriptionTags = pgTable(
  "email_subscription_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .references(() => emailSubscriptions.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.subscriptionId, t.tagId)],
);

// User's selected feeds for email delivery
export const emailSubscriptionFeeds = pgTable(
  "email_subscription_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .references(() => emailSubscriptions.id, { onDelete: "cascade" })
      .notNull(),
    feedId: uuid("feed_id")
      .references(() => feeds.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.subscriptionId, t.feedId)],
);

// Track which articles have been sent to each user (prevents duplicates)
export const emailSentArticles = pgTable(
  "email_sent_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    articleId: uuid("article_id")
      .references(() => articles.id, { onDelete: "cascade" })
      .notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.articleId)],
);

// Log each digest send attempt for history and catch-up
export const emailDigestLogs = pgTable("email_digest_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  articleCount: integer("article_count").default(0),
  status: varchar("status", { length: 20 }).$type<"success" | "failed">().default("success"),
  errorMessage: text("error_message"),
});

// Record the article set included in each digest send, so we can preview
// and resend past digests with the exact same content.
export const emailDigestLogArticles = pgTable(
  "email_digest_log_articles",
  {
    logId: uuid("log_id")
      .references(() => emailDigestLogs.id, { onDelete: "cascade" })
      .notNull(),
    articleId: uuid("article_id")
      .references(() => articles.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.logId, t.articleId] })],
);

// Hot lists are independent of RSS articles and per-user unread state.
export const hotSources = pgTable("hot_sources", {
  key: varchar("key", { length: 80 }).primaryKey(),
  lastFetchedAt: timestamp("last_fetched_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
});

export const hotItems = pgTable(
  "hot_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKey: varchar("source_key", { length: 80 })
      .notNull()
      .references(() => hotSources.key, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    cover: text("cover"),
    desc: text("desc"),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    peakRank: integer("peak_rank").notNull(),
  },
  (t) => [
    unique().on(t.sourceKey, t.itemKey),
    index("hot_items_source_seen_idx").on(t.sourceKey, t.lastSeenAt),
  ],
);

export const hotSnapshots = pgTable(
  "hot_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKey: varchar("source_key", { length: 80 })
      .notNull()
      .references(() => hotSources.key, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
  },
  (t) => [index("hot_snapshots_source_captured_idx").on(t.sourceKey, t.capturedAt)],
);

export const hotRanks = pgTable(
  "hot_ranks",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => hotSnapshots.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => hotItems.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    heat: doublePrecision("heat"),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.itemId] })],
);

// ─── Rules (per-user automation over new articles / hot items) ──
export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    scope: varchar("scope", { length: 10 }).$type<RuleScope>().notNull().default("article"),
    matchMode: varchar("match_mode", { length: 3 }).$type<RuleMatchMode>().notNull().default("all"),
    conditions: jsonb("conditions").$type<RuleCondition[]>().notNull().default([]),
    actions: jsonb("actions").$type<RuleAction[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("rules_user_idx").on(t.userId)],
);

/** Hot items already notified per rule, so a re-ranked item doesn't alert twice. */
export const ruleHotHits = pgTable(
  "rule_hot_hits",
  {
    ruleId: uuid("rule_id")
      .references(() => rules.id, { onDelete: "cascade" })
      .notNull(),
    itemId: uuid("item_id")
      .references(() => hotItems.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.itemId] })],
);

// ─── Notification channels ────────────────────────────────────
export const notificationChannels = pgTable(
  "notification_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 20 }).$type<NotificationChannelType>().notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    /** Channel-specific JSON, encrypted with lib/crypto/secrets. Null for webpush. */
    config: text("config"),
    enabled: boolean("enabled").notNull().default(true),
    lastError: text("last_error"),
    lastSentAt: timestamp("last_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("notification_channels_user_idx").on(t.userId)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

// ─── Third-party client access (Google Reader / Fever APIs) ────
export const apiCredentials = pgTable("api_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** scrypt hash of the dedicated API password (never the login password). */
  passwordHash: text("password_hash").notNull(),
  /** Fever api_key = md5("email:apiPassword"), hex. */
  feverKey: varchar("fever_key", { length: 32 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Bearer tokens issued by Google Reader ClientLogin. Stored as sha256 hex. */
export const clientTokens = pgTable(
  "client_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    client: varchar("client", { length: 100 }),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("client_tokens_user_idx").on(t.userId)],
);

// ─── Re-published RSS outputs ─────────────────────────────────
export const shareFeeds = pgTable(
  "share_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    /** Unguessable URL token (base64url, 32 bytes). */
    token: varchar("token", { length: 64 }).notNull().unique(),
    filter: jsonb("filter").$type<ShareFeedFilter>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("share_feeds_user_idx").on(t.userId)],
);
