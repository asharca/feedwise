import { expect, it } from "vitest";
import { detectView } from "@/lib/feeds/detect-view";

const base = {
  title: "A long article title about news",
  contentText: "x".repeat(900),
  summary: null,
  imageUrl: null,
  url: null,
  media: [],
};
it.each(["https://youtu.be/one", "https://www.bilibili.com/video/1", "https://vimeo.com/123"])(
  "recognizes video link %s",
  (url) => {
    expect(detectView([{ ...base, url }])).toBe("video");
  },
);
it("uses a strict majority, and distinguishes still images, podcasts and short posts", () => {
  const audio = { ...base, media: [{ type: "audio" as const, url: "https://example.org/a.mp3" }] };
  expect(detectView([audio, base, audio])).toBe("audio");
  expect(detectView([audio, base])).toBe("article");
  expect(detectView([{ ...base, media: [{ type: "video", url: "clip" }] }])).toBe("video");
  expect(detectView([{ ...base, contentText: "", imageUrl: "photo" }])).toBe("picture");
  expect(detectView([{ ...base, imageUrl: "photo" }])).toBe("article");
  expect(detectView([{ ...base, contentText: "brief post", title: null }])).toBe("social");
  expect(detectView([])).toBe("article");
});
