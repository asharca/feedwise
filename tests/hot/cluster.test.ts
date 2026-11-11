// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clusterHotItems } from "@/lib/hot/cluster";
import type { HotBoard } from "@/lib/hot/types";

function board(key: string, titles: string[], rank = 1): HotBoard {
  return {
    source: { key, name: key, category: "news", homeUrl: null },
    status: "ok",
    error: null,
    fetchedAt: null,
    items: titles.map((title, i) => ({
      id: `${key}-${i}`,
      title,
      url: `https://${key}.com/${i}`,
      rank: rank + i,
      heat: null,
      rankDelta: null,
      isNew: false,
      firstSeenAt: "2026-11-12T00:00:00.000Z",
      cover: null,
      desc: null,
    })),
  };
}

describe("cross-platform hot event clustering", () => {
  it("merges the same Chinese event and chooses its best-ranked headline", () => {
    const result = clusterHotItems([
      board("a", ["神舟二十一号载人飞船发射成功，三名航天员顺利进入太空"], 5),
      board("b", ["神舟二十一号载人飞船发射成功，三名航天员进入太空"], 1),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sources).toHaveLength(2);
    expect(result[0].title).toBe("神舟二十一号载人飞船发射成功，三名航天员进入太空");
  });

  it("supports Latin words and normalized punctuation/case", () => {
    expect(
      clusterHotItems([
        board("a", ["OpenAI releases GPT 6 model today"]),
        board("b", ["OPENAI releases GPT 6 model today!"]),
      ]),
    ).toHaveLength(1);
  });

  it("never merges two items from one source, including transitive matches", () => {
    expect(
      clusterHotItems([board("a", ["相同事件今天正式公布结果", "相同事件今天正式公布结果"])]),
    ).toEqual([]);
    const result = clusterHotItems([
      board("a", ["相同事件今天正式公布结果", "相同事件今天正式公布结果"]),
      board("b", ["相同事件今天正式公布结果"]),
      board("c", ["相同事件今天正式公布结果"]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sources).toHaveLength(3);
    for (const group of result)
      expect(new Set(group.sources.map((item) => item.source.key)).size).toBe(group.sources.length);
  });

  it("keeps unrelated titles apart and ignores punctuation-only titles", () => {
    expect(
      clusterHotItems([
        board("a", ["台风登陆沿海地区，多地发布暴雨预警", "！！！"]),
        board("b", ["苹果发布全新笔记本电脑，芯片性能提升", "？？？"]),
      ]),
    ).toEqual([]);
  });

  it("orders by platform count then best rank and limits to 15 events", () => {
    const titles = Array.from({ length: 20 }, (_, i) => `topic${i} exclusive${i} event${i}`);
    const result = clusterHotItems([
      board("a", titles),
      board("b", titles),
      board("c", [titles[19]], 30),
    ]);
    expect(result).toHaveLength(15);
    expect(result[0].sources).toHaveLength(3);
    expect(result[0].title).toBe(titles[19]);
    expect(result[1].title).toBe(titles[0]);
  });
});
