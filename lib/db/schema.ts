import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  real,
  jsonb,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

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
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id),
    position: integer("position").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.name)]
);

// ─── Feeds (global) ───────────────────────────────────────────
export const feeds = pgTable("feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull().unique(),
  title: varchar("title", { length: 500 }),
  description: text("description"),
  siteUrl: text("site_url"),
  iconUrl: text("icon_url"),
  feedType: varchar("feed_type", { length: 20 }).$type<"rss" | "atom" | "json">(),
  lastFetchedAt: timestamp("last_fetched_at"),
  lastFetchError: text("last_fetch_error"),
  fetchIntervalMinutes: integer("fetch_interval_minutes").default(60),
  etag: varchar("etag", { length: 255 }),
  lastModified: varchar("last_modified", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

    position: integer("position").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.feedId)]
);

// ─── Articles ─────────────────────────────────────────────────
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    imageUrl: text("image_url"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.feedId, t.guid),
    index("articles_feed_published_idx").on(t.feedId, t.publishedAt),
  ]
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
  },
  (t) => [
    unique().on(t.userId, t.articleId),
    index("user_articles_unread_idx").on(t.userId, t.isRead),
  ]
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
  (t) => [unique().on(t.userId, t.name)]
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
    source: varchar("source", { length: 10 })
      .$type<"user">()
      .default("user"),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })]
);

// ─── Email Subscriptions ──────────────────────────────────────────
export const emailSubscriptions = pgTable(
  "email_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    enabled: boolean("enabled").notNull().default(false),
    sendTime: varchar("send_time", { length: 5 }).default("08:00"),
    frequency: varchar("frequency", { length: 10 })
      .$type<"daily" | "weekly">()
      .default("daily"),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

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
  (t) => [unique().on(t.subscriptionId, t.tagId)]
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
  (t) => [unique().on(t.subscriptionId, t.feedId)]
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
  (t) => [unique().on(t.userId, t.articleId)]
);

// Log each digest send attempt for history and catch-up
export const emailDigestLogs = pgTable(
  "email_digest_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    articleCount: integer("article_count").default(0),
    status: varchar("status", { length: 20 }).$type<"success" | "failed">().default("success"),
    errorMessage: text("error_message"),
  }
);
