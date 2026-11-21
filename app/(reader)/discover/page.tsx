"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Loader2, Plus, RefreshCw, Rss, Search } from "lucide-react";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { dispatchSubscriptionsChanged } from "@/lib/reader/events";
import { cn } from "@/lib/utils";

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

interface DiscoverData {
  baseUrl: string;
  routes: RouteMap;
}

interface SubscribeResultData {
  failed?: number;
  results?: Array<{ feedId?: string; url: string; error?: string }>;
}

function getParamKeys(path: string): { key: string; optional: boolean }[] {
  const matches = [...path.matchAll(/:(\w+)(\?)?/g)];
  return matches.map((m) => ({ key: m[1], optional: !!m[2] }));
}

function buildUrl(baseUrl: string, path: string, params: Record<string, string>): string {
  let result = path
    .replace(/:(\w+)\?/g, (_, key) => params[key]?.trim() || "")
    .replace(/:(\w+)/g, (_, key) => params[key]?.trim() || `:${key}`);
  result = result.replace(/\/+/g, "/").replace(/\/$/, "");
  return `${baseUrl}${result}`;
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

function RouteCard({ route, baseUrl }: { route: Route; baseUrl: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [subscribed, setSubscribed] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const detailsId = useId();

  const paramKeys = useMemo(() => getParamKeys(route.path), [route.path]);
  const hasParams = paramKeys.length > 0;

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => {
    if (expanded) {
      const defaults: Record<string, string> = {};
      for (const { key } of paramKeys) {
        defaults[key] = paramDefault(route.parameters?.[key]);
      }
      setParams(defaults);
    }
  }, [expanded, paramKeys, route.parameters]);

  const feedUrl = useMemo(
    () => buildUrl(baseUrl, route.path, params),
    [baseUrl, route.path, params],
  );

  const hasUnfilledRequired = paramKeys
    .filter((p) => !p.optional)
    .some((p) => !params[p.key]?.trim());

  const subscribeMutation = useMutation({
    mutationFn: async (url: string) => {
      const data = await apiFetch<SubscribeResultData>("/api/feeds", {
        method: "POST",
        json: { url },
      });
      if ((data?.failed ?? 0) > 0) {
        const firstError = data?.results?.find((r) => r.error)?.error;
        throw new Error(firstError ?? "无法抓取该订阅源");
      }
      return data;
    },
    onSuccess: (data, url) => {
      const feedId = data?.results?.find((result) => result.url === url)?.feedId;
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      dispatchSubscriptionsChanged(feedId);
      setSubscribed(true);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setSubscribed(false), 3000);
    },
  });

  const errorMessage =
    subscribeMutation.error instanceof Error ? subscribeMutation.error.message : "";

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
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-14 min-w-0 flex-1 items-start gap-2.5 px-3.5 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        >
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
            <Rss aria-hidden="true" className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{route.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>{route.namespace}</span>
              <code className="max-w-full truncate font-mono text-[11px]">{route.path}</code>
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {route.url && (
          <a
            href={route.url.startsWith("http") ? route.url : `https://${route.url}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`访问 ${route.name} 源站`}
            className="flex min-w-11 shrink-0 items-center justify-center border-l border-border/50 text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>

      {expanded && (
        <div id={detailsId} className="space-y-3 border-t border-border/60 bg-muted/20 px-3.5 py-3">
          {route.description && (
            <p className="text-xs leading-relaxed text-muted-foreground">{route.description}</p>
          )}

          {hasParams && (
            <div className="space-y-2">
              {paramKeys.map(({ key, optional }) => {
                const info = route.parameters?.[key];
                const label = paramLabel(info);
                const options = typeof info === "object" && info?.options ? info.options : null;
                const inputId = `${detailsId}-${key}`;
                return (
                  <div key={key} className="space-y-1">
                    <label htmlFor={inputId} className="block text-xs font-medium text-foreground">
                      <span>{key}</span>
                      {optional && (
                        <span className="ml-1 font-normal text-muted-foreground">（可选）</span>
                      )}
                      {label && (
                        <span className="ml-1.5 font-normal text-muted-foreground">— {label}</span>
                      )}
                    </label>
                    {options ? (
                      <select
                        id={inputId}
                        value={params[key] ?? ""}
                        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {optional && <option value="">（默认）</option>}
                        {Object.entries(options).map(([val, desc]) => (
                          <option key={val} value={val}>
                            {desc} ({val})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={inputId}
                        value={params[key] ?? ""}
                        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={paramDefault(info) || key}
                        className="h-9 rounded-md text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="truncate rounded border border-border/60 bg-background px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
            {feedUrl}
          </div>

          {errorMessage && (
            <p role="alert" className="text-xs text-destructive">
              {errorMessage}
            </p>
          )}

          <Button
            type="button"
            className="h-10 w-full rounded-md text-sm"
            disabled={subscribeMutation.isPending || subscribed || hasUnfilledRequired}
            onClick={() => subscribeMutation.mutate(feedUrl)}
            aria-live="polite"
          >
            {subscribed ? (
              "已添加到订阅"
            ) : subscribeMutation.isPending ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                正在订阅…
              </>
            ) : (
              <>
                <Plus aria-hidden="true" className="size-4" />
                订阅
              </>
            )}
          </Button>
        </div>
      )}
    </article>
  );
}

export default function DiscoverPage() {
  const [search, setSearch] = useState("");
  const [activeNs, setActiveNs] = useState<string | null>(null);

  const routesQuery = useQuery({
    queryKey: queryKeys.discover.all,
    queryFn: ({ signal }) => apiFetch<DiscoverData>("/api/discover", { signal }),
    staleTime: 5 * 60 * 1000,
  });

  const routes = useMemo(() => routesQuery.data?.routes ?? {}, [routesQuery.data]);
  const baseUrl = routesQuery.data?.baseUrl ?? "";
  const loading = routesQuery.isLoading;
  const error = routesQuery.error
    ? routesQuery.error instanceof Error
      ? routesQuery.error.message
      : "加载 RSSHub 路由失败"
    : "";

  const namespaces = useMemo(() => {
    const ns = new Set<string>();
    for (const route of Object.values(routes)) ns.add(route.namespace);
    return [...ns].sort((a, b) => a.localeCompare(b));
  }, [routes]);

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

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <SidebarTrigger className="size-11 md:hidden" />
        <h1 className="text-base font-semibold">发现</h1>
        {!loading && !error && (
          <span className="text-xs text-muted-foreground">
            共 {Object.keys(routes).length.toLocaleString()} 个 RSSHub 源
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label="RSS 源命名空间"
          className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/60 p-2 scrollbar-thin 2xl:flex"
        >
          <NamespaceFilterButton
            label="全部来源"
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

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border/60 px-4 py-3">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <label htmlFor="discover-search" className="sr-only">
                    搜索来源和路由
                  </label>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="discover-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索来源和路由"
                    className="h-10 rounded-md bg-muted/40 pl-9 text-sm"
                  />
                </div>
                {!loading && !error && (
                  <span
                    aria-live="polite"
                    className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block"
                  >
                    {filtered.length.toLocaleString()} 条匹配
                  </span>
                )}
              </div>

              <nav
                aria-label="按命名空间筛选"
                className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin 2xl:hidden"
              >
                <NamespaceFilterButton
                  compact
                  label="全部"
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

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div
                role="status"
                className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"
              >
                <Loader2 aria-hidden="true" className="size-6 animate-spin" />
                <p className="text-sm">正在从 RSSHub 加载路由…</p>
              </div>
            ) : error ? (
              <div
                role="alert"
                className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground"
              >
                <p className="text-sm font-medium text-destructive">{error}</p>
                <Button type="button" variant="outline" onClick={() => void routesQuery.refetch()}>
                  <RefreshCw className="size-4" />
                  重试
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">未找到匹配的路由</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    试试其他关键词或切换来源分类。
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
                  清除筛选
                </Button>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-6xl px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))] items-start gap-3">
                  {filtered.slice(0, 200).map((route) => (
                    <RouteCard key={route.path} route={route} baseUrl={baseUrl} />
                  ))}
                </div>
                {filtered.length > 200 && (
                  <p className="border-t border-border/60 py-4 text-center text-sm text-muted-foreground">
                    仅展示前 200 / {filtered.length.toLocaleString()} 条 — 请输入关键词缩小范围
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
