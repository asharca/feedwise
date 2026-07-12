"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChartNoAxesColumn,
  Minus,
  RefreshCw,
} from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

interface Timeline {
  days: string[];
  newPerDay: number[];
  readsPerDay: number[];
  tagActivity: Array<{
    tag: { id: string; name: string };
    counts: number[];
    total: number;
    prevTotal: number;
  }>;
}

type RangePreset = "7" | "30" | "90" | "custom";

const RANGE_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "custom", label: "Custom" },
];

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function ChartsPanel() {
  const [range, setRange] = useState<RangePreset>("7");
  const [customFrom, setCustomFrom] = useState(daysAgoIso(7));
  const [customTo, setCustomTo] = useState(todayIso());

  // Decoupled current (rendered) vs requested (in-flight) data, so we can show
  // the previous result while the new one loads — eliminates the spinner flash.
  const [data, setData] = useState<Timeline | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const queryUrl = useMemo(() => {
    if (range === "custom" && customFrom && customTo) {
      return `/api/dashboard/timeline?from=${customFrom}&to=${customTo}`;
    }
    return `/api/dashboard/timeline?days=${range}`;
  }, [range, customFrom, customTo]);

  const hasActivity = Boolean(
    data &&
    (data.newPerDay.some((value) => value > 0) ||
      data.readsPerDay.some((value) => value > 0) ||
      data.tagActivity.length > 0),
  );

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    setError(null);
    fetch(queryUrl)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error("Could not load activity");
        }
        return payload;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d.data as Timeline);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : "Could not load activity");
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryUrl, retryKey]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          Activity
          {refreshing && data && (
            <span className="inline-block size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
          )}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {range === "custom" && (
            <div className="flex items-center gap-1.5 text-sm">
              <input
                type="date"
                value={customFrom}
                max={customTo || todayIso()}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="Start date"
                className="min-h-9 min-w-0 cursor-pointer rounded-md border border-input bg-muted px-2 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={todayIso()}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="End date"
                className="min-h-9 min-w-0 cursor-pointer rounded-md border border-input bg-muted px-2 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
              />
            </div>
          )}
          <Segmented
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
            aria-label="Date range"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Activity unavailable</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Retry activity"
            onClick={() => setRetryKey((key) => key + 1)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      )}

      {!data && !error ? (
        <div
          role="status"
          aria-label="Loading activity"
          aria-busy="true"
          className="flex items-center justify-center rounded-lg border border-border bg-card p-6"
        >
          <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
        </div>
      ) : data && !hasActivity ? (
        <div className="flex min-h-20 items-center gap-3 rounded-lg border border-border px-4 py-3 text-muted-foreground">
          <ChartNoAxesColumn className="size-5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">No activity in this range</p>
            <p className="text-xs">New articles and reading trends will appear here.</p>
          </div>
        </div>
      ) : data ? (
        // Keep charts mounted across range changes; faint dim while refreshing
        // signals that values are stale without unmounting/relayout.
        <div
          className={cn(
            "grid grid-cols-1 lg:grid-cols-2 gap-3 transition-opacity duration-150",
            refreshing && "opacity-70",
          )}
        >
          <BarsCard
            title="Articles added"
            subtitle="per day in your subscriptions"
            days={data.days}
            values={data.newPerDay}
            tone="primary"
          />
          <BarsCard
            title="Articles read"
            subtitle="when you marked them read"
            days={data.days}
            values={data.readsPerDay}
            tone="success"
          />
          <div className="lg:col-span-2">
            <TrendingBoard
              days={data.days}
              rows={data.tagActivity}
              comparisonLabel={
                range === "custom" ? "the previous period" : `the previous ${range}d`
              }
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function fmtTotal(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function BarsCard({
  title,
  subtitle,
  days,
  values,
  tone,
}: {
  title: string;
  subtitle: string;
  days: string[];
  values: number[];
  tone: "primary" | "success";
}) {
  const max = Math.max(1, ...values);
  const total = fmtTotal(values);

  const barColor = tone === "primary" ? "bg-primary" : "bg-emerald-500";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {title}
          </div>
          <div className="text-[11px] text-muted-foreground/70 mt-0.5">{subtitle}</div>
        </div>
        <div className="text-xl font-semibold tabular-nums">{total}</div>
      </div>
      <div
        className="flex items-end gap-[2px] h-20"
        role="img"
        aria-label={`${title} bar chart for ${days.length} days`}
      >
        {values.map((v, i) => {
          const heightPct = v === 0 ? 2 : Math.max(2, (v / max) * 100);
          return (
            <div
              key={days[i]}
              className="flex-1 flex flex-col justify-end h-full"
              title={`${days[i]}: ${v}`}
            >
              <div
                className={cn(
                  "rounded-sm transition-colors",
                  v === 0 ? "bg-muted/50" : barColor,
                  v > 0 && "opacity-70 hover:opacity-100",
                )}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground/70 tabular-nums">
        <span>{shortDate(days[0])}</span>
        {days.length > 6 && <span>{shortDate(days[Math.floor(days.length / 2)])}</span>}
        <span>{shortDate(days[days.length - 1])}</span>
      </div>
    </div>
  );
}

function TrendingBoard({
  days,
  rows,
  comparisonLabel,
}: {
  days: string[];
  rows: Timeline["tagActivity"];
  comparisonLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED = 10;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
          Trending
        </div>
        <div className="text-[11px] text-muted-foreground/70 mb-3">
          Top tags by volume, with momentum vs {comparisonLabel}.
        </div>
        <p className="text-sm text-muted-foreground py-4">
          No tagged articles in this range. Enable Auto-tag in Settings → Smart Digest to populate
          this.
        </p>
      </div>
    );
  }

  // rows arrive sorted by current-window volume (desc) from the API.
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const rangeLabel = days.length
    ? `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`
    : "";
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Trending
          </div>
          <div className="text-[11px] text-muted-foreground/70 mt-0.5">
            Top tags by volume · momentum vs {comparisonLabel}
          </div>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
          {rangeLabel}
        </span>
      </div>
      <ol className="space-y-1">
        {visible.map((row, i) => (
          <TrendingRow key={row.tag.id} rank={i + 1} row={row} days={days} maxTotal={maxTotal} />
        ))}
      </ol>
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-2 w-full rounded-md py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          {expanded ? "Show less" : `Show all ${rows.length} tags`}
        </button>
      )}
    </div>
  );
}

function TrendingRow({
  rank,
  row,
  days,
  maxTotal,
}: {
  rank: number;
  row: Timeline["tagActivity"][number];
  days: string[];
  maxTotal: number;
}) {
  const fillPct = Math.max(5, (row.total / maxTotal) * 100);
  const delta = row.total - row.prevTotal;
  const isNew = row.prevTotal === 0 && row.total > 0;
  const lead = rank === 1;

  return (
    <li className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2.5">
      <span
        className={cn(
          "text-right text-sm font-semibold tabular-nums",
          lead ? "text-primary" : "text-muted-foreground/45",
        )}
      >
        {rank}
      </span>

      {/* Tag name + count layered over a bar sized to the tag's share of volume */}
      <div className="relative min-w-0 h-8 rounded-md overflow-hidden bg-muted/35">
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-500 ease-[var(--ease-out)]",
            lead ? "bg-primary/25" : "bg-primary/12",
          )}
          style={{ width: `${fillPct}%` }}
        />
        <div className="relative flex h-full items-center justify-between gap-2 px-2.5">
          <span className="truncate text-[13px] font-medium text-foreground" title={row.tag.name}>
            {row.tag.name}
          </span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground/90">
            {row.total}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <MomentumChip delta={delta} isNew={isNew} />
        <Sparkline counts={row.counts} days={days} />
      </div>
    </li>
  );
}

function MomentumChip({ delta, isNew }: { delta: number; isNew: boolean }) {
  if (isNew) {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        New
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="inline-flex w-12 items-center justify-end gap-0.5 text-[11px] tabular-nums text-muted-foreground/55">
        <Minus className="size-3" />0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex w-12 items-center justify-end gap-0.5 text-[11px] font-medium tabular-nums",
        up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400",
      )}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {up ? "+" : "−"}
      {Math.abs(delta)}
    </span>
  );
}

// Compact daily-trend bars. Long ranges are bucketed so each bar stays legible.
function Sparkline({ counts, days }: { counts: number[]; days: string[] }) {
  const bars = bucketSeries(counts, 16);
  const max = Math.max(1, ...bars);
  const label = days.length ? `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}` : "";
  return (
    <div className="hidden sm:flex h-7 w-20 items-end gap-px" title={`Daily volume · ${label}`}>
      {bars.map((v, i) => {
        const h = v === 0 ? 10 : Math.max(10, (v / max) * 100);
        const last = i === bars.length - 1;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-[1px]",
              v === 0 ? "bg-muted" : last ? "bg-primary" : "bg-primary/40",
            )}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

// Sum adjacent days into at most `maxBars` buckets so sparklines stay readable
// across 7/30/90-day ranges without becoming a wall of hairline bars.
function bucketSeries(values: number[], maxBars: number): number[] {
  if (values.length <= maxBars) return values;
  const size = Math.ceil(values.length / maxBars);
  const out: number[] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size).reduce((s, v) => s + v, 0));
  }
  return out;
}

function shortDate(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}
