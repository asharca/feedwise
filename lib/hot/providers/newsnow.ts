import { z } from "zod";

// Canonical (non-redirect) IDs from newsnext/newsnow: shared/sources.json
// and server/sources/. Not every DailyHot board has a NewsNow source.
const ids = new Map(
  Object.entries({
    thepaper: "thepaper",
    "qq-news": "tencent-hot",
    weibo: "weibo",
    toutiao: "toutiao",
    baidu: "baidu",
    "36kr": "36kr-renqi",
    ithome: "ithome",
    sspai: "sspai",
    juejin: "juejin",
    v2ex: "v2ex-share",
    coolapk: "coolapk",
    zhihu: "zhihu",
    tieba: "tieba",
    hupu: "hupu",
    bilibili: "bilibili-hot-video",
    douyin: "douyin",
    "douban-movie": "douban",
  }),
);

const extra = z.object({
  info: z.union([z.string(), z.literal(false)]).optional(),
  hover: z.string().optional(),
  icon: z.union([z.string(), z.literal(false), z.object({ url: z.string() })]).optional(),
});
const payload = z.object({
  status: z.enum(["success", "cache"]),
  id: z.string(),
  updatedTime: z.union([z.number(), z.string()]),
  items: z.array(
    z.object({
      title: z.string().trim().min(1),
      url: z.string(),
      mobileUrl: z.string().optional(),
      extra: extra.optional(),
    }),
  ),
});

export const newsnow = {
  path(key: string) {
    const id = ids.get(key);
    if (!id) throw new Error(`NewsNow 不支持热榜源：${key}`);
    return `/api/s?id=${encodeURIComponent(id)}`;
  },
  entries(input: unknown, key: string) {
    const data = payload.parse(input);
    if (data.id !== ids.get(key)) throw new Error("NewsNow 热榜源不匹配");
    return data.items.map(({ title, url, mobileUrl, extra }) => ({
      title,
      url,
      mobileUrl,
      cover: typeof extra?.icon === "object" ? extra.icon.url : extra?.icon || null,
      desc: extra?.hover || extra?.info || null,
      hot: null,
    }));
  },
};
