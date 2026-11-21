import { createHash } from "node:crypto";
import { z } from "zod";
import type { HtmlSourceConfig } from "@/lib/db/schema-types";

const selector = z.string().trim().min(1).max(1000);
export const htmlConfigSchema = z.object({
  item: selector,
  title: selector,
  link: selector.optional(),
  content: selector.optional(),
  date: selector.optional(),
  image: selector.optional(),
});

export function htmlSourceUrl(pageUrl: string, config: HtmlSourceConfig): string {
  const url = new URL(pageUrl);
  // Validate and keep key order stable across JSON requests and Postgres jsonb.
  const json = JSON.stringify(htmlConfigSchema.parse(config));
  url.hash = "feedwise-html=" + createHash("sha1").update(json).digest("hex").slice(0, 12);
  return url.href;
}
