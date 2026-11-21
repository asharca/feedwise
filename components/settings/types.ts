import type {
  ContentView,
  NotificationChannelType,
  RuleAction,
  RuleCondition,
  RuleMatchMode,
  RuleScope,
  ShareFeedFilter,
} from "@/lib/db/schema-types";

export interface GeneralSettings {
  theme?: "light" | "dark" | "system";
}

export interface Sub {
  id: string;
  feedId: string;
  title: string | null;
  feedTitle: string | null;
  url: string;
  iconUrl: string | null;
  folderId?: string | null;
  fetchIntervalMinutes: number | null;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
  position: number;
}

export interface TagItem {
  id: string;
  name: string;
  color: string | null;
  articleCount: number;
}

export interface EmailSettings {
  enabled: boolean;
  sendTime: string;
  frequency: "daily" | "weekly";
  cronExpression: string | null;
  selectedTags: string[];
  selectedFeeds: string[];
  hasSmtpPass?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  autoSaveOnClick?: boolean;
  markReadOnClick?: boolean;
}

export interface DigestLog {
  id: string;
  sentAt: string;
  articleCount: number | null;
  status: "success" | "failed" | null;
  errorMessage: string | null;
}

export interface DigestPreviewResult {
  mode: string;
  html: string;
  articleCount: number;
  sentAt?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
}

export interface LlmConfig {
  enabled: boolean;
  baseUrl: string;
  apiKeyMask: string;
  model: string;
  format: "openai" | "anthropic";
  autoSummarize: boolean;
  autoTag: boolean;
}

export interface LlmModelItem {
  id: string;
  displayName: string;
}

export interface RuleDto {
  id: string;
  name: string;
  enabled: boolean;
  scope: RuleScope;
  matchMode: RuleMatchMode;
  conditions: RuleCondition[];
  actions: RuleAction[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface RulePreviewMatch {
  id: string;
  title: string;
  source: string;
  url: string | null;
  at: string | null;
}

export interface NotificationChannelDto {
  id: string;
  type: NotificationChannelType;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  configuredSecrets: string[];
  lastError: string | null;
  lastSentAt: string | null;
  createdAt: string;
}

export interface ApiAccessDto {
  configured: boolean;
  username: string;
  greaderUrl: string;
  feverUrl: string;
}

export interface ShareFeedDto {
  id: string;
  name: string;
  filter: ShareFeedFilter;
  url: string;
  createdAt: string;
}

export const CONTENT_VIEW_LABELS: Record<ContentView, string> = {
  article: "文章",
  social: "动态",
  picture: "图片",
  video: "视频",
  audio: "音频",
};
