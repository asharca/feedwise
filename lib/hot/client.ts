import { z } from "zod";
import { canonicalizeUrl } from "@/lib/digest/normalize-url";
import type { NormalizedHotItem } from "./types";

const UpstreamSchema = z.object({
  code: z.literal(200),
  data: z.array(
    z.object({
      // Upstream IDs can exceed Number.MAX_SAFE_INTEGER: deliberately ignored.
      title: z.string().trim().min(1),
      url: z.string().nullish(),
      mobileUrl: z.string().nullish(),
      cover: z.string().nullish(),
      desc: z.string().nullish(),
      hot: z.number().finite().nullish(),
    }),
  ),
});

function webUrl(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:"
      ? canonicalizeUrl(url.toString())
      : null;
  } catch {
    return null;
  }
}

export function normalizeHotResponse(input: unknown): NormalizedHotItem[] {
  const parsed = UpstreamSchema.parse(input);
  const seen = new Set<string>();
  const items: NormalizedHotItem[] = [];
  parsed.data.forEach((entry, index) => {
    const url = webUrl(entry.url) ?? webUrl(entry.mobileUrl) ?? "";
    const itemKey = url || entry.title.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (seen.has(itemKey)) return;
    seen.add(itemKey);
    items.push({
      itemKey,
      title: entry.title,
      url,
      cover: webUrl(entry.cover),
      desc: entry.desc?.trim() || null,
      heat: entry.hot ?? null,
      rank: index + 1,
    });
  });
  return items;
}

export interface HotClientDeps {
  fetch: typeof fetch;
  baseUrl: string;
}

export async function fetchHotSource(
  key: string,
  deps: HotClientDeps = {
    fetch: globalThis.fetch,
    baseUrl: process.env.HOT_API_URL ?? "http://localhost:6688",
  },
): Promise<NormalizedHotItem[]> {
  const response = await deps.fetch(
    `${deps.baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(key)}`,
    {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (response.status !== 200) throw new Error(`热榜源请求失败（HTTP ${response.status}）`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("热榜源返回了无效的 JSON 数据");
  }
  try {
    return normalizeHotResponse(payload);
  } catch {
    throw new Error("热榜源返回了无效的数据格式");
  }
}
