import type { HotCategory, HotSourceInfo } from "./types";

export interface HotSource extends HotSourceInfo {
  intervalMinutes: number;
}

function source(key: string, name: string, category: HotCategory, homeUrl: string): HotSource {
  return { key, name, category, homeUrl, intervalMinutes: 20 };
}

// Display order is intentional. Temporarily unavailable upstreams stay visible.
export const HOT_SOURCES: readonly HotSource[] = [
  source("thepaper", "澎湃新闻", "news", "https://www.thepaper.cn"),
  source("qq-news", "腾讯新闻", "news", "https://news.qq.com"),
  source("netease-news", "网易新闻", "news", "https://news.163.com"),
  source("weibo", "微博热搜", "news", "https://s.weibo.com/top/summary"),
  source("toutiao", "今日头条", "news", "https://www.toutiao.com"),
  source("baidu", "百度热搜", "news", "https://top.baidu.com"),
  source("36kr", "36氪", "tech", "https://36kr.com"),
  source("ithome", "IT之家", "tech", "https://www.ithome.com"),
  source("sspai", "少数派", "tech", "https://sspai.com"),
  source("juejin", "稀土掘金", "tech", "https://juejin.cn"),
  source("v2ex", "V2EX", "tech", "https://www.v2ex.com"),
  source("hellogithub", "HelloGitHub", "tech", "https://hellogithub.com"),
  source("ifanr", "爱范儿", "tech", "https://www.ifanr.com"),
  source("huxiu", "虎嗅", "tech", "https://www.huxiu.com"),
  source("coolapk", "酷安", "tech", "https://www.coolapk.com"),
  source("zhihu", "知乎热榜", "community", "https://www.zhihu.com/hot"),
  source("tieba", "百度贴吧", "community", "https://tieba.baidu.com"),
  source("hupu", "虎扑", "community", "https://www.hupu.com"),
  source("bilibili", "B站热门", "entertainment", "https://www.bilibili.com"),
  source("douyin", "抖音热点", "entertainment", "https://www.douyin.com"),
  source("douban-movie", "豆瓣电影", "entertainment", "https://movie.douban.com"),
  source("weread", "微信读书", "entertainment", "https://weread.qq.com"),
];

export function getHotSource(key: string): HotSource | undefined {
  return HOT_SOURCES.find((entry) => entry.key === key);
}

export function sourceInfo({ key, name, category, homeUrl }: HotSourceInfo): HotSourceInfo {
  return { key, name, category, homeUrl };
}

export function refreshDelayMs(source: HotSource, failures: number): number {
  return Math.max(10, source.intervalMinutes) * 60_000 * 2 ** Math.min(3, Math.max(0, failures));
}
