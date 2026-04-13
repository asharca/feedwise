import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";

const RSSHUB_BASE = "https://rsshub.ashark.icu";
const NAMESPACE_URL = `${RSSHUB_BASE}/api/namespace`;
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

interface RouteEntry {
  path: string;
  name: string;
  namespace: string;
  url?: string;
  description?: string;
  example?: string;
  parameters?: Record<string, unknown>;
  categories?: string[];
}

type FlatRouteMap = Record<string, RouteEntry>;

interface NamespacePayload {
  routes?: Record<string, Omit<RouteEntry, "path" | "namespace">>;
  name?: string;
}

let cache: { data: FlatRouteMap; at: number } | null = null;

function flattenNamespaceRoutes(json: Record<string, NamespacePayload>): FlatRouteMap {
  const result: FlatRouteMap = {};
  for (const [nsKey, ns] of Object.entries(json)) {
    if (!ns.routes) continue;
    const nsDisplayName = ns.name ?? nsKey;
    for (const [routeSuffix, route] of Object.entries(ns.routes)) {
      const fullPath = `/${nsKey}${routeSuffix}`;
      result[fullPath] = { ...route, path: fullPath, namespace: nsDisplayName };
    }
  }
  return result;
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (cache && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json({ success: true, data: cache.data });
  }

  try {
    const res = await fetch(NAMESPACE_URL, { next: { revalidate: 21600 } });
    if (!res.ok) throw new Error(`RSSHub responded ${res.status}`);
    const json = await res.json();
    const flat = flattenNamespaceRoutes(json);
    cache = { data: flat, at: Date.now() };
    return NextResponse.json({ success: true, data: cache.data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to fetch routes" },
      { status: 502 }
    );
  }
}
