export type HotCategory = "news" | "tech" | "community" | "entertainment";

export interface HotSourceInfo {
  key: string;
  name: string;
  category: HotCategory;
  homeUrl: string | null;
}

export interface HotItem {
  id: string;
  title: string;
  url: string;
  rank: number;
  heat: number | null;
  rankDelta: number | null;
  isNew: boolean;
  firstSeenAt: string;
  cover: string | null;
  desc: string | null;
}

export interface HotBoard {
  source: HotSourceInfo;
  status: "ok" | "error" | "empty";
  error: string | null;
  fetchedAt: string | null;
  items: HotItem[];
}

export interface HotCluster {
  title: string;
  sources: Array<{ source: HotSourceInfo; title: string; url: string; rank: number }>;
}

export interface HotTrending {
  rising: Array<HotItem & { source: HotSourceInfo }>;
  crossPlatform: HotCluster[];
}

export interface NormalizedHotItem {
  itemKey: string;
  title: string;
  url: string;
  cover: string | null;
  desc: string | null;
  heat: number | null;
  rank: number;
}
