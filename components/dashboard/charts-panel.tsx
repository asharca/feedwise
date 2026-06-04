"use client";

import { useEffect, useMemo, useState } from "react";
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

  const queryUrl = useMemo(() => {
    if (range === "custom" && customFrom && customTo) {
      return `/api/dashboard/timeline?from=${customFrom}&to=${customTo}`;
    }
    return `/api/dashboard/timeline?days=${range}`;
  }, [range, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    fetch(queryUrl)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.success) setData(d.data as Timeline);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryUrl]);

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
                className="bg-muted rounded-md px-2 py-1 text-xs outline-none cursor-pointer"
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={todayIso()}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-muted rounded-md px-2 py-1 text-xs outline-none cursor-pointer"
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

      {!data ? (
        <div
          className="rounded-lg border border-border bg-card p-6 flex items-center justify-center"
          aria-busy="true"
        >
          <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
        </div>
      ) : (
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
            <TagHeatmap days={data.days} rows={data.tagActivity} />
          </div>
        </div>
      )}
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

function TagHeatmap({ days, rows }: { days: string[]; rows: Timeline["tagActivity"] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
          Tag heatmap
        </div>
        <div className="text-[11px] text-muted-foreground/70 mb-3">
          Daily article counts per tag, deepest = busiest day for that tag.
        </div>
        <p className="text-sm text-muted-foreground py-4">
          No tagged articles in this range. Enable Auto-tag in Settings → Smart Digest to populate
          this.
        </p>
      </div>
    );
  }

  const allValues = rows.flatMap((r) => r.counts);
  const max = Math.max(1, ...allValues);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Tag heatmap
          </div>
          <div className="text-[11px] text-muted-foreground/70 mt-0.5">
            Daily article counts per tag, deepest cell = busiest day.
          </div>
        </div>
        <Legend />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-fit space-y-0.5">
          {rows.map((row) => (
            <div key={row.tag.id} className="flex items-center gap-2">
              <div
                className="w-20 shrink-0 text-xs truncate text-foreground/80"
                title={row.tag.name}
              >
                {row.tag.name}
              </div>
              <div className="flex gap-[2px] flex-1">
                {row.counts.map((v, i) => (
                  <div
                    key={days[i]}
                    className={cn("h-4 flex-1 rounded-[2px]", cellClass(v, max))}
                    title={`${row.tag.name} · ${days[i]}: ${v}`}
                  />
                ))}
              </div>
              <div className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/80">
                {row.total}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1.5 ml-[5.5rem] mr-[3rem]">
        <div className="flex justify-between flex-1 text-[10px] text-muted-foreground/70 tabular-nums">
          <span>{shortDate(days[0])}</span>
          {days.length > 6 && <span>{shortDate(days[Math.floor(days.length / 2)])}</span>}
          <span>{shortDate(days[days.length - 1])}</span>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const steps = [0, 0.2, 0.4, 0.6, 0.85];
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-[10px] text-muted-foreground/70">less</span>
      {steps.map((s, i) => (
        <div key={i} className={cn("size-2.5 rounded-[2px]", bucketClass(s))} />
      ))}
      <span className="text-[10px] text-muted-foreground/70">more</span>
    </div>
  );
}

function cellClass(value: number, max: number): string {
  if (value === 0) return "bg-muted/40";
  return bucketClass(value / max);
}

function bucketClass(ratio: number): string {
  if (ratio === 0) return "bg-muted/40";
  if (ratio < 0.25) return "bg-primary/20";
  if (ratio < 0.5) return "bg-primary/40";
  if (ratio < 0.75) return "bg-primary/65";
  return "bg-primary/90";
}

function shortDate(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}
