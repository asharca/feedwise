"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Plus, ExternalLink, Loader2, Rss, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const RSSHUB_URL = "https://rsshub.ashark.icu";

interface RouteParam {
  description?: string;
  default?: string | null;
  options?: Record<string, string>;
}

interface Route {
  path: string;
  name: string;
  namespace: string;
  url?: string;
  description?: string;
  parameters?: Record<string, RouteParam | string>;
  categories?: string[];
}

type RouteMap = Record<string, Route>;

function getParamKeys(path: string): { key: string; optional: boolean }[] {
  const matches = [...path.matchAll(/:(\w+)(\?)?/g)];
  return matches.map((m) => ({ key: m[1], optional: !!m[2] }));
}

function buildUrl(path: string, params: Record<string, string>): string {
  let result = path
    .replace(/:(\w+)\?/g, (_, key) => params[key]?.trim() || "")
    .replace(/:(\w+)/g, (_, key) => params[key]?.trim() || `:${key}`);
  // Clean up empty optional segments
  result = result.replace(/\/+/g, "/").replace(/\/$/, "");
  return `${RSSHUB_URL}${result}`;
}

function paramLabel(info: RouteParam | string | undefined): string {
  if (!info) return "";
  if (typeof info === "string") return info;
  return info.description ?? "";
}

function paramDefault(info: RouteParam | string | undefined): string {
  if (!info || typeof info === "string") return "";
  return info.default ?? "";
}

function RouteCard({ route, onSubscribe }: { route: Route; onSubscribe: (url: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState("");

  const paramKeys = useMemo(() => getParamKeys(route.path), [route.path]);
  const hasParams = paramKeys.length > 0;

  useEffect(() => {
    if (expanded) {
      const defaults: Record<string, string> = {};
      for (const { key } of paramKeys) {
        defaults[key] = paramDefault(route.parameters?.[key]);
      }
      setParams(defaults);
    }
  }, [expanded, paramKeys, route.parameters]);

  const feedUrl = useMemo(() => buildUrl(route.path, params), [route.path, params]);

  const hasUnfilledRequired = paramKeys
    .filter((p) => !p.optional)
    .some((p) => !params[p.key]?.trim());

  async function handleSubscribe() {
    setError("");
    setSubscribing(true);
    try {
      await onSubscribe(feedUrl);
      setSubscribed(true);
      setTimeout(() => setSubscribed(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <div className={cn(
      "break-inside-avoid rounded-xl border border-border/50 bg-card transition-all duration-150",
      expanded && "border-border shadow-sm"
    )}>
      {/* Header row */}
      <div
        className="flex items-start gap-3 p-3 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold leading-tight">{route.name}</span>
            {route.url && (
              <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-md shrink-0">
                {route.url}
              </span>
            )}
          </div>
          {route.description && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-1">
              {route.description.replace(/<[^>]*>/g, "")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {!hasParams && !expanded && (
            <button
              className="text-[11px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
              onClick={(e) => { e.stopPropagation(); handleSubscribe(); }}
              disabled={subscribing || subscribed}
            >
              {subscribed ? "Added!" : subscribing ? "Adding..." : "Subscribe"}
            </button>
          )}
          {expanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded: params + URL + subscribe */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40 pt-3">
          {hasParams && (
            <div className="space-y-2">
              {paramKeys.map(({ key, optional }) => {
                const info = route.parameters?.[key];
                const label = paramLabel(info);
                const opts = typeof info === "object" && info?.options ? info.options : null;

                return (
                  <div key={key} className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium flex gap-1">
                      <span className="font-mono text-primary/80">{key}</span>
                      {optional && <span className="text-muted-foreground/50">(optional)</span>}
                      {label && <span>— {label}</span>}
                    </label>
                    {opts ? (
                      <select
                        value={params[key] ?? ""}
                        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full text-[12px] rounded-lg border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Select...</option>
                        {Object.entries(opts).map(([val, opt]) => {
                          const label = typeof opt === "string" ? opt : opt?.label ?? val;
                          return (
                            <option key={val} value={typeof opt === "object" ? opt.value ?? val : val}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <Input
                        value={params[key] ?? ""}
                        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={optional ? "optional" : "required"}
                        className="h-8 text-[12px] rounded-lg"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* URL preview */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
            <Rss className="size-3 text-muted-foreground/50 shrink-0" />
            <span className="text-[11px] text-muted-foreground/70 font-mono truncate flex-1">{feedUrl}</span>
            <a href={feedUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="size-3 text-muted-foreground/50 hover:text-primary transition-colors" />
            </a>
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}

          <Button
            size="sm"
            className="w-full rounded-lg h-8 text-[12px]"
            disabled={subscribing || subscribed || hasUnfilledRequired}
            onClick={handleSubscribe}
          >
            {subscribed ? "Added to feeds!" : subscribing ? (
              <><Loader2 className="size-3 animate-spin mr-1.5" />Adding...</>
            ) : (
              <><Plus className="size-3 mr-1.5" />Subscribe</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function DiscoverPage() {
  const [routes, setRoutes] = useState<RouteMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeNs, setActiveNs] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/discover")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRoutes(d.data as RouteMap);
        else setError(d.error ?? "Failed to load");
      })
      .catch(() => setError("Failed to load routes"))
      .finally(() => setLoading(false));
  }, []);

  // All namespaces sorted alphabetically by display name
  const namespaces = useMemo(() => {
    const ns = new Set<string>();
    for (const route of Object.values(routes)) ns.add(route.namespace);
    return [...ns].sort((a, b) => a.localeCompare(b));
  }, [routes]);

  // Filter routes by search + namespace
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return Object.values(routes).filter((r) => {
      const nsMatch = !activeNs || r.namespace === activeNs;
      if (!nsMatch) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.url?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      );
    });
  }, [routes, search, activeNs]);

  const handleSubscribe = useCallback(async (url: string) => {
    const res = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error ?? "Failed");
    if (data.data?.failed > 0) throw new Error("Feed could not be fetched");
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 h-11 flex items-center gap-3 shrink-0 border-b border-border/50">
        <SidebarTrigger className="md:hidden" />
        <span className="text-sm font-semibold tracking-tight">Discover</span>
        {!loading && (
          <span className="text-[11px] text-muted-foreground/60 ml-1">
            {Object.keys(routes).length.toLocaleString()} feeds via RSSHub
          </span>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Namespace sidebar */}
        <div className="hidden md:flex flex-col w-48 shrink-0 border-r border-border/50 overflow-y-auto scrollbar-thin py-1.5">
          <button
            onClick={() => setActiveNs(null)}
            className={cn(
              "text-left px-3 py-2 text-[13px] leading-snug rounded-lg mx-1.5 transition-colors",
              !activeNs ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground"
            )}
          >
            All sources
          </button>
          {namespaces.map((ns) => (
            <button
              key={ns}
              onClick={() => setActiveNs(ns === activeNs ? null : ns)}
              className={cn(
                "text-left px-3 py-2 text-[13px] leading-snug rounded-lg mx-1.5 transition-colors break-words",
                activeNs === ns ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground"
              )}
            >
              {ns}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Search */}
          <div className="px-4 py-2.5 border-b border-border/50 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search routes..."
                className="pl-8 h-8 text-[13px] rounded-lg bg-muted/50 border-transparent focus:border-border"
              />
            </div>
          </div>

          {/* Mobile namespace chips */}
          <div className="md:hidden flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-thin shrink-0">
            <button
              onClick={() => setActiveNs(null)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full shrink-0 transition-colors",
                !activeNs ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              All
            </button>
            {namespaces.map((ns) => (
              <button
                key={ns}
                onClick={() => setActiveNs(ns === activeNs ? null : ns)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-full shrink-0 transition-colors capitalize",
                  activeNs === ns ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {ns}
              </button>
            ))}
          </div>

          {/* Route list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                <p className="text-sm">Loading routes from RSSHub...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-8">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : (
              <div className="p-3 columns-1 md:columns-2 xl:columns-3 gap-2 space-y-2">
                {filtered.slice(0, 200).map((route) => (
                  <RouteCard key={route.path} route={route} onSubscribe={handleSubscribe} />
                ))}
                {filtered.length > 200 && (
                  <p className="col-span-full text-center text-[12px] text-muted-foreground py-4">
                    Showing 200 of {filtered.length} — refine your search
                  </p>
                )}
                {filtered.length === 0 && (
                  <p className="col-span-full text-center text-sm text-muted-foreground py-12">
                    No routes found
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
