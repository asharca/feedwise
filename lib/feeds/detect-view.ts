import type { ContentView } from "@/lib/db/schema-types";
import { videoLink, type ParsedArticle } from "./item";

type Sample = Pick<
  ParsedArticle,
  "title" | "contentText" | "summary" | "imageUrl" | "url" | "media"
>;

export function detectView(items: Sample[]): ContentView {
  const votes = { video: 0, audio: 0, picture: 0, social: 0 };
  for (const i of items) {
    const length = (i.contentText || i.summary || "").trim().length;
    if (videoLink(i.url) || i.media.some((m) => m.type === "video")) votes.video++;
    else if (i.media.some((m) => m.type === "audio")) votes.audio++;
    else if (length < 280 && (i.imageUrl || i.media.some((m) => m.type === "image")))
      votes.picture++;
    else if (length <= 500 && (i.title?.trim().length ?? 0) <= 16) votes.social++;
  }
  for (const view of ["video", "audio", "picture", "social"] as const) {
    if (votes[view] > items.length / 2) return view;
  }
  return "article";
}
