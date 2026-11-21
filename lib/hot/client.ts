import { dailyhot, type ProviderEntry } from "./providers/dailyhot";
import { newsnow } from "./providers/newsnow";
import { canonicalizeUrl } from "@/lib/digest/normalize-url";
import type { NormalizedHotItem } from "./types";

function selectProvider(name = "dailyhot") {
  if (name === "dailyhot") return dailyhot;
  if (name === "newsnow") return newsnow;
  throw new Error(`未知的 HOT_API_PROVIDER：${name}`);
}

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
  return normalizeEntries(dailyhot.entries(input));
}

function normalizeEntries(entries: ProviderEntry[]): NormalizedHotItem[] {
  const seen = new Set<string>();
  const items: NormalizedHotItem[] = [];
  entries.forEach((entry, index) => {
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
  provider?: string;
}

export async function fetchHotSource(
  key: string,
  deps: HotClientDeps = {
    fetch: globalThis.fetch,
    baseUrl: process.env.HOT_API_URL ?? "http://localhost:6688",
    provider: process.env.HOT_API_PROVIDER,
  },
): Promise<NormalizedHotItem[]> {
  const provider = selectProvider(deps.provider);
  const response = await deps.fetch(`${deps.baseUrl.replace(/\/+$/, "")}${provider.path(key)}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status !== 200) throw new Error(`热榜源请求失败（HTTP ${response.status}）`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("热榜源返回了无效的 JSON 数据");
  }
  try {
    return normalizeEntries(provider.entries(payload, key));
  } catch {
    throw new Error("热榜源返回了无效的数据格式");
  }
}
