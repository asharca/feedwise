// Shared JSON column shapes for lib/db/schema.ts. Pure types: safe to import
// from client components.

/** How a subscription is presented in the reader. */
export type ContentView = "article" | "social" | "picture" | "video" | "audio";
export const CONTENT_VIEWS: readonly ContentView[] = [
  "article",
  "social",
  "picture",
  "video",
  "audio",
];

/** How a feed row is fetched: a real feed document, or an HTML page scraped via CSS selectors. */
export type FeedSourceType = "rss" | "html";

/** CSS selectors used to turn a plain web page into feed entries. */
export interface HtmlSourceConfig {
  /** Selects one element per entry. */
  item: string;
  /** Relative to `item`. Text content becomes the entry title. */
  title: string;
  /** Relative to `item`. `href` of the matched element (or its closest <a>). Defaults to the title element. */
  link?: string;
  /** Relative to `item`. Text content becomes the entry summary/content. */
  content?: string;
  /** Relative to `item`. `datetime` attribute or text, parsed as a date. */
  date?: string;
  /** Relative to `item`. `src` (or `data-src`) of the matched element. */
  image?: string;
}

export interface ArticleMedia {
  url: string;
  type: "image" | "video" | "audio";
  mimeType?: string;
  /** Poster/preview image for video/audio. */
  previewUrl?: string;
  width?: number;
  height?: number;
  /** Seconds, for audio/video enclosures. */
  duration?: number;
}

export type FullContentStatus = "ok" | "failed";

// ─── Rules ────────────────────────────────────────────────────

export type RuleScope = "article" | "hot";
export type RuleMatchMode = "all" | "any";

/**
 * `feedId` / `folderId` only apply to article rules; `hotSource` only to hot rules.
 * `content` matches article content text + summary, or hot item description.
 */
export type RuleField =
  | "title"
  | "content"
  | "author"
  | "url"
  | "feedId"
  | "folderId"
  | "hotSource";
export type RuleOperator = "contains" | "notContains" | "regex" | "equals" | "notEquals";

export interface RuleCondition {
  field: RuleField;
  op: RuleOperator;
  value: string;
}

/** Hot-scope rules support `notify` only. */
export type RuleAction =
  | { type: "markRead" }
  | { type: "star" }
  | { type: "hide" }
  | { type: "addTag"; tagId: string }
  | { type: "fetchFullText" }
  | { type: "notify"; channelIds: string[] };

// ─── Notifications ────────────────────────────────────────────

export type NotificationChannelType =
  | "webhook"
  | "telegram"
  | "bark"
  | "ntfy"
  | "feishu"
  | "dingtalk"
  | "wecom"
  | "webpush";

// ─── Shared RSS output ────────────────────────────────────────

/** All fields optional and AND-ed; empty filter = all subscribed articles. */
export interface ShareFeedFilter {
  feedId?: string;
  folderId?: string;
  tagId?: string;
  starred?: boolean;
  view?: ContentView;
}
