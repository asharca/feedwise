import { describe, expect, it } from "vitest";
import {
  computeGridColumns,
  detectVideoPlatform,
  extractFirstImage,
  formatDuration,
  getArticleImages,
  getFirstAudioMedia,
  getFirstVideoMedia,
} from "@/lib/reader/media";

describe("formatDuration", () => {
  it("returns null for missing or non-positive values", () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-10)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });

  it("formats sub-hour and multi-hour durations", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("extractFirstImage & getArticleImages", () => {
  it("extracts only HTTPS images from HTML", () => {
    expect(extractFirstImage('<p><img src="http://example.com/a.jpg" /></p>')).toBeNull();
    expect(extractFirstImage('<p><img src="https://example.com/a.jpg" /></p>')).toBe(
      "https://example.com/a.jpg",
    );
  });

  it("prefers deduplicated media images and falls back to imageUrl or summary", () => {
    expect(
      getArticleImages({
        imageUrl: "https://example.com/cover.jpg",
        media: [
          { url: "https://example.com/1.jpg", type: "image", width: 800, height: 600 },
          { url: "https://example.com/1.jpg", type: "image" },
          { url: "https://example.com/v.mp4", type: "video" },
          { url: "https://example.com/2.jpg", type: "image" },
        ],
      }),
    ).toEqual([
      { url: "https://example.com/1.jpg", type: "image", width: 800, height: 600 },
      { url: "https://example.com/2.jpg", type: "image" },
    ]);

    expect(getArticleImages({ imageUrl: "https://example.com/cover.jpg", media: null })).toEqual([
      { url: "https://example.com/cover.jpg", type: "image" },
    ]);

    expect(getArticleImages({ summary: '<img src="https://example.com/inline.png">' })).toEqual([
      { url: "https://example.com/inline.png", type: "image" },
    ]);
  });
});

describe("video and audio media pickers", () => {
  it("picks the first matching video or audio entry", () => {
    const media = [
      { url: "https://example.com/a.jpg", type: "image" as const },
      { url: "https://example.com/v1.mp4", type: "video" as const, duration: 120 },
      { url: "https://example.com/p1.mp3", type: "audio" as const, duration: 300 },
    ];
    expect(getFirstVideoMedia(media)?.url).toBe("https://example.com/v1.mp4");
    expect(getFirstAudioMedia(media)?.url).toBe("https://example.com/p1.mp3");
    expect(getFirstVideoMedia(null)).toBeNull();
    expect(getFirstAudioMedia([])).toBeNull();
  });
});

describe("computeGridColumns", () => {
  it("returns at least 1 column and scales with container width", () => {
    expect(computeGridColumns(0)).toBe(1);
    expect(computeGridColumns(200, 240, 12)).toBe(1);
    expect(computeGridColumns(500, 240, 12)).toBe(2);
    expect(computeGridColumns(760, 240, 12)).toBe(3);
    expect(computeGridColumns(1020, 240, 12)).toBe(4);
  });
});

describe("detectVideoPlatform", () => {
  it("identifies YouTube and Bilibili URLs and ignores direct files", () => {
    expect(detectVideoPlatform("https://www.youtube.com/watch?v=abc")?.provider).toBe("youtube");
    expect(detectVideoPlatform("https://youtu.be/abc")?.provider).toBe("youtube");
    expect(detectVideoPlatform("https://www.bilibili.com/video/BV1xx")?.provider).toBe("bilibili");
    expect(detectVideoPlatform("https://cdn.example.com/video.mp4")).toBeNull();
    expect(detectVideoPlatform("not-a-url")).toBeNull();
  });
});
