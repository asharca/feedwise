"use client";

import { useState, useEffect, useMemo, useCallback, useId } from "react";
import { Search, Plus, ExternalLink, Loader2, RefreshCw, Rss, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { dispatchSubscriptionsChanged } from "@/lib/reader/events";
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

interface SubscribeResponse {
  success: boolean;
  error?: string;
  data?: {
    failed?: number;
    results?: Array<{ feedId?: string; url: string }>;
  };
}

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

function NamespaceFilterButton({
  label,
  active,
  compact = false,
  onClick,
}: {
  label: string;
  active: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
        compact
          ? "min-h-10 shrink-0 rounded-full px-3 text-xs"
          : "min-h-10 w-full rounded-md px-3 py-2 text-left text-sm",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function RouteCard({
  route,
  onSubscribe,
}: {
  route: Route;
  onSubscribe: (url: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState("");
  const detailsId = useId();

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
    <article
      className={cn(
        "overflow-hidden rounded-md border border-border/70 bg-background transition-colors",
        expanded && "border-primary/30 bg-card",
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-16 min-w-0 flex-1 items-start gap-3 p-3 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="min-w-0 text-sm font-semibold leading-snug text-foreground">
                {route.name}
              </h2>
              {route.url && (
                <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                  {route.url}
                </span>
              )}
            </div>
            {route.description && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {route.description.replace(/<[^>]*>/g, "")}
              </p>
            )}
          </div>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
        </button>

        {!hasParams && !expanded && (
          <div className="flex items-center pr-3 sm:pr-4">
            <Button
              type="button"
              variant={subscribed ? "secondary" : "outline"}
              className="h-10 rounded-md px-3 text-xs"
              onClick={handleSubscribe}
              disabled={subscribing || subscribed}
              aria-live="polite"
            >
              {subscribing && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
              {subscribed ? "Added" : subscribing ? "Adding" : "Subscribe"}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:px-4"
        >
          {error}
        </p>
      )}

      {/* Expanded: params + URL + subscribe */}
      {expanded && (
        <div
          id={detailsId}
          className="space-y-4 border-t border-border/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4"
        >
          {hasParams && (
            <div className="space-y-3">
              {paramKeys.map(({ key, optional }) => {
                const info = route.parameters?.[key];
                const label = paramLabel(info);
                const opts = typeof info === "object" && info?.options ? info.options : null;
                const inputId = `${detailsId}-${key}`;

                return (
                  <div key={key} className="space-y-1">
                    <label
                      htmlFor={inputId}
                      className="flex flex-wrap gap-x-1 text-xs font-medium leading-relaxed text-muted-foreground"
                    >
                      <span className="font-mono text-foreground">{key}</span>
                      {optional && <span>(optional)</span>}
                      {label && <span>— {label}</span>}
                    </label>
                    {opts ? (
                      <select
                        id={inputId}
                        value={params[key] ?? ""}
                        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="">Select…</option>
                        {Object.entries(opts).map(([val, opt]) => (
                          <option key={val} value={val}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={inputId}
                        value={params[key] ?? ""}
                        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={optional ? "optional" : "required"}
                        className="h-10 rounded-md text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* URL preview */}
          <div className="flex min-h-10 items-center gap-2 rounded-md bg-muted/60 px-3">
            <Rss aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{feedUrl}</code>
            <a
              href={feedUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${route.name} feed URL`}
              title="Open feed URL"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          </div>

          <Button
            type="button"
            className="h-10 w-full rounded-md text-sm"
            disabled={subscribing || subscribed || hasUnfilledRequired}
            onClick={handleSubscribe}
            aria-live="polite"
          >
            {subscribed ? (
              "Added to feeds"
            ) : subscribing ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Plus aria-hidden="true" className="size-4" />
                Subscribe
              </>
            )}
          </Button>
        </div>
      )}
    </article>
  );
}

export default function DiscoverPage() {
  const [routes, setRoutes] = useState<RouteMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeNs, setActiveNs] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/discover");
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: RouteMap;
        error?: string;
      } | null;
      if (!response.ok || !data?.success || !data.data) {
        throw new Error(data?.error ?? "Failed to load routes");
      }
      setRoutes(data.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load routes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

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
    const data = (await res.json()) as SubscribeResponse;
    if (!data.success) throw new Error(data.error ?? "Failed");
    if ((data.data?.failed ?? 0) > 0) throw new Error("Feed could not be fetched");
    const feedId = data.data?.results?.find((result) => result.url === url)?.feedId;
    dispatchSubscriptionsChanged(feedId);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <SidebarTrigger className="size-11 md:hidden" />
        <h1 className="text-base font-semibold">Discover</h1>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {Object.keys(routes).length.toLocaleString()} feeds via RSSHub
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Namespace sidebar */}
        <nav
          aria-label="RSS source namespaces"
          className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/60 p-2 scrollbar-thin 2xl:flex"
        >
          <NamespaceFilterButton
            label="All sources"
            active={!activeNs}
            onClick={() => setActiveNs(null)}
          />
          {namespaces.map((ns) => (
            <NamespaceFilterButton
              key={ns}
              label={ns}
              active={activeNs === ns}
              onClick={() => setActiveNs(ns === activeNs ? null : ns)}
            />
          ))}
        </nav>

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border/60">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative w-full max-w-2xl">
                  <label htmlFor="discover-search" className="sr-only">
                    Search sources and routes
                  </label>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="discover-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search sources and routes"
                    className="h-10 rounded-md bg-muted/40 pl-9 text-sm"
                  />
                </div>
                {!loading && !error && (
                  <span
                    aria-live="polite"
                    className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block"
                  >
                    {filtered.length.toLocaleString()} matches
                  </span>
                )}
              </div>

              {/* Compact namespace filters remain available until the content
                  area is wide enough for a dedicated rail. */}
              <nav
                aria-label="Filter by RSS source namespace"
                className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin 2xl:hidden"
              >
                <NamespaceFilterButton
                  compact
                  label="All"
                  active={!activeNs}
                  onClick={() => setActiveNs(null)}
                />
                {namespaces.map((ns) => (
                  <NamespaceFilterButton
                    compact
                    key={ns}
                    label={ns}
                    active={activeNs === ns}
                    onClick={() => setActiveNs(ns === activeNs ? null : ns)}
                  />
                ))}
              </nav>
            </div>
          </div>

          {/* Route list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div
                role="status"
                className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
              >
                <Loader2 aria-hidden="true" className="size-6 animate-spin" />
                <p className="text-sm">Loading routes from RSSHub…</p>
              </div>
            ) : error ? (
              <div
                role="alert"
                className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground"
              >
                <p className="text-sm font-medium text-destructive">{error}</p>
                <Button type="button" variant="outline" onClick={() => void loadRoutes()}>
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">No routes found</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try a different search or source.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-md"
                  onClick={() => {
                    setSearch("");
                    setActiveNs(null);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-6xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))] items-start gap-3">
                  {filtered.slice(0, 200).map((route) => (
                    <RouteCard key={route.path} route={route} onSubscribe={handleSubscribe} />
                  ))}
                </div>
                {filtered.length > 200 && (
                  <p className="border-t border-border/60 py-4 text-center text-sm text-muted-foreground">
                    Showing 200 of {filtered.length.toLocaleString()} — refine your search
                  </p>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
