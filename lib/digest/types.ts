import type { EmailArticle } from "@/lib/email/sender";
import type { Cluster } from "./cluster-types";

export type DigestArticle = EmailArticle;

export interface DedupedArticle {
  primary: DigestArticle;
  duplicates: DigestArticle[];
}

export interface TopHeadline {
  cluster: Cluster;
  primaryArticle: DigestArticle;
  sourceCount: number;
}

export interface TopicGroup {
  topic: string;
  totalCount: number;
  clusters: Array<{
    cluster: Cluster;
    primary: DigestArticle;
    duplicates: DigestArticle[];
  }>;
}

export type DigestMode = "clustered" | "fallback-no-config" | "fallback-llm-failed";

export interface OrganizedDigest {
  date: Date;
  totalArticles: number;
  topicCount: number;
  topHeadlines: TopHeadline[];
  topicGroups: TopicGroup[];
  ungrouped: DigestArticle[];
  mode: DigestMode;
}
