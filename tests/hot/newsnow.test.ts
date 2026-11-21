// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { fetchHotSource } from "@/lib/hot/client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("selects NewsNow from the environment and normalizes its cache and icon metadata", async () => {
  vi.stubEnv("HOT_API_PROVIDER", "newsnow");
  vi.stubEnv("HOT_API_URL", "http://hot.test/");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      id: "tencent-hot",
      status: "cache",
      updatedTime: 1,
      items: [
        {
          id: 1,
          title: " 新闻 ",
          url: "",
          mobileUrl: "https://example.org/article?utm_source=hot",
          extra: { hover: "详情", info: "标签", icon: { url: "https://img.test/icon", scale: 2 } },
        },
        { id: 2, title: "重复", url: "https://example.org/article" },
        { id: 3, title: "另一个", url: "", extra: { info: false, icon: false } },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const items = await fetchHotSource("qq-news");
  expect(fetcher).toHaveBeenCalledWith("http://hot.test/api/s?id=tencent-hot", expect.anything());
  expect(items).toEqual([
    {
      itemKey: "https://example.org/article",
      title: "新闻",
      url: "https://example.org/article",
      rank: 1,
      cover: "https://img.test/icon",
      desc: "详情",
      heat: null,
    },
    { itemKey: "另一个", title: "另一个", url: "", rank: 3, cover: null, desc: null, heat: null },
  ]);
});
it("reports an unsupported source or provider before fetching", async () => {
  const fetcher = vi.fn();
  for (const [provider, message] of [
    ["newsnow", "NewsNow 不支持热榜源：weread"],
    ["invalid", "HOT_API_PROVIDER"],
  ]) {
    await expect(
      fetchHotSource("weread", { fetch: fetcher, baseUrl: "http://hot.test", provider }),
    ).rejects.toThrow(message);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects mismatched source ids and unsuccessful upstream payloads", async () => {
  for (const [id, status] of [
    ["weibo", "success"],
    ["douban", "error"],
  ]) {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ id, status, items: [], updatedTime: 0 }));
    await expect(
      fetchHotSource("douban-movie", {
        fetch: fetcher,
        baseUrl: "http://hot.test",
        provider: "newsnow",
      }),
    ).rejects.toThrow("数据格式");
    expect(fetcher).toHaveBeenCalledWith("http://hot.test/api/s?id=douban", expect.anything());
  }
});
