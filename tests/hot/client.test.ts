// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchHotSource, normalizeHotResponse } from "@/lib/hot/client";

const entry = { title: "新闻标题", url: "https://EXAMPLE.com/story/?utm_source=hot#part" };

describe("hot client normalization", () => {
  it("uses normalized URLs, never unsafe numeric upstream IDs", () => {
    const result = normalizeHotResponse(
      JSON.parse(
        '{"code":200,"data":[{"id":9876543210987654321,"title":"新闻标题","url":"https://EXAMPLE.com/story/?utm_source=hot#part"}]}',
      ),
    );
    expect(result).toEqual([
      {
        itemKey: "https://example.com/story",
        title: "新闻标题",
        url: "https://example.com/story",
        cover: null,
        desc: null,
        heat: null,
        rank: 1,
      },
    ]);
    expect(normalizeHotResponse({ code: 200, data: [{ ...entry, id: "different" }] })).toEqual(
      result,
    );
  });

  it("keeps heat and position, deduplicates normalized identities", () => {
    const result = normalizeHotResponse({
      code: 200,
      data: [
        { ...entry, hot: 123, desc: " 摘要 " },
        { ...entry, url: "https://example.com/story" },
        { title: "另一条", url: "https://example.com/other", hot: 0 },
      ],
    });
    expect(result.map((item) => [item.rank, item.heat])).toEqual([
      [1, 123],
      [3, 0],
    ]);
    expect(result[0].desc).toBe("摘要");
  });

  it("falls back to mobile URLs and then titles, discarding unsafe links", () => {
    const result = normalizeHotResponse({
      code: 200,
      data: [
        { title: "手机版", url: "", mobileUrl: "https://example.com/mobile" },
        { title: "  无链接 标题  ", url: "javascript:alert(1)", cover: "javascript:bad" },
      ],
    });
    expect(result[0].itemKey).toBe("https://example.com/mobile");
    expect(result[1]).toMatchObject({ itemKey: "无链接 标题", url: "", cover: null });
  });

  it("fetches the configured endpoint with a timeout signal", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ code: 200, data: [entry] })));
    expect(
      await fetchHotSource("qq-news", { fetch: fetcher, baseUrl: "http://upstream:6688/" }),
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      "http://upstream:6688/qq-news",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("treats HTML responses and non-200 upstream codes as failures", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(new Response("<html>broken</html>", { status: 503 }));
    await expect(
      fetchHotSource("weibo", { fetch: fetcher, baseUrl: "http://hot" }),
    ).rejects.toThrow("HTTP 503");
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 200, data: [] }), { status: 201 }),
    );
    await expect(
      fetchHotSource("weibo", { fetch: fetcher, baseUrl: "http://hot" }),
    ).rejects.toThrow("HTTP 201");
    fetcher.mockResolvedValueOnce(new Response("<html>broken</html>"));
    await expect(
      fetchHotSource("weibo", { fetch: fetcher, baseUrl: "http://hot" }),
    ).rejects.toThrow("JSON");
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code: 500, data: [] })));
    await expect(
      fetchHotSource("weibo", { fetch: fetcher, baseUrl: "http://hot" }),
    ).rejects.toThrow("数据格式");
  });

  it("rejects invalid item structures rather than silently publishing partial boards", () => {
    expect(() => normalizeHotResponse({ code: 200, data: [{ title: "" }] })).toThrow();
    expect(normalizeHotResponse({ code: 200, data: [] })).toEqual([]);
  });
});
