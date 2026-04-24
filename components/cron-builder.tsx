"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CronBuilderProps {
  value: string | null;
  onChange: (cron: string) => void;
  disabled?: boolean;
}

type CronPreset = "daily" | "weekly" | "monthly" | "custom";

const WEEKDAYS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" },
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function describeCron(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [minute, hour, day, month, weekday] = parts;

  const h = parseInt(hour);
  const m = parseInt(minute);
  const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  if (day === "*" && month === "*" && weekday === "*") {
    return `每天 ${timeStr}`;
  }
  if (day === "*" && month === "*" && /^\d$/.test(weekday)) {
    const wd = WEEKDAYS.find((w) => w.value === parseInt(weekday));
    return `每周${wd?.label ?? weekday} ${timeStr}`;
  }
  if (/^\d+$/.test(day) && month === "*" && weekday === "*") {
    return `每月${day}号 ${timeStr}`;
  }
  if (day === "*" && month === "*" && weekday === "1-5") {
    return `工作日 ${timeStr}`;
  }

  return `${cron} (${timeStr})`;
}

export default function CronBuilder({ value, onChange, disabled }: CronBuilderProps) {
  const [mode, setMode] = useState<CronPreset>("daily");
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [customDraft, setCustomDraft] = useState(value || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable onChange reference to avoid unnecessary effect runs
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Parse existing value on mount / when value changes externally
  useEffect(() => {
    if (!value) return;
    const parts = value.split(" ");
    if (parts.length !== 5) {
      setMode("custom");
      setCustomDraft(value);
      return;
    }

    const [m, h, d, mo, wd] = parts;
    setHour(parseInt(h) || 8);
    setMinute(parseInt(m) || 0);

    if (d === "*" && mo === "*" && wd === "*") {
      setMode("daily");
    } else if (d === "*" && mo === "*" && /^\d$/.test(wd)) {
      setMode("weekly");
      setWeekday(parseInt(wd));
    } else if (/^\d+$/.test(d) && mo === "*" && wd === "*") {
      setMode("monthly");
      setMonthDay(parseInt(d));
    } else {
      setMode("custom");
      setCustomDraft(value);
    }
  }, [value]);

  // Build cron from state for non-custom modes
  useEffect(() => {
    if (mode === "custom") return;

    const m = String(minute).padStart(2, "0");
    const h = String(hour).padStart(2, "0");

    let cron = "";
    switch (mode) {
      case "daily":
        cron = `${m} ${h} * * *`;
        break;
      case "weekly":
        cron = `${m} ${h} * * ${weekday}`;
        break;
      case "monthly":
        cron = `${m} ${h} ${monthDay} * *`;
        break;
    }

    if (cron && cron !== value) {
      onChangeRef.current(cron);
    }
  }, [mode, hour, minute, weekday, monthDay, value]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setCustomDraft(newValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current(newValue);
    }, 600);
  }, []);

  const handleModeChange = useCallback((newMode: CronPreset) => {
    if (newMode === "custom") {
      setCustomDraft(value || "0 8 * * *");
    }
    setMode(newMode);
  }, [value]);

  const presets: { key: CronPreset; label: string }[] = [
    { key: "daily", label: "每天" },
    { key: "weekly", label: "每周" },
    { key: "monthly", label: "每月" },
    { key: "custom", label: "自定义" },
  ];

  return (
    <div className={cn("space-y-3", disabled && "opacity-60 pointer-events-none")}>
      {/* Preset tabs */}
      <div className="flex gap-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => handleModeChange(p.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              mode === p.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-accent"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Time picker */}
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">时</label>
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="text-sm bg-muted rounded-lg px-2 py-1.5 outline-none cursor-pointer min-w-[64px]"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {String(i).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
        <span className="text-muted-foreground pt-5">:</span>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">分</label>
          <select
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="text-sm bg-muted rounded-lg px-2 py-1.5 outline-none cursor-pointer min-w-[64px]"
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Weekly selector */}
      {mode === "weekly" && (
        <div className="flex gap-1.5 flex-wrap">
          {WEEKDAYS.map((wd) => (
            <button
              key={wd.value}
              type="button"
              onClick={() => setWeekday(wd.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                weekday === wd.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              )}
            >
              {wd.label}
            </button>
          ))}
        </div>
      )}

      {/* Monthly selector */}
      {mode === "monthly" && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">日期</label>
          <select
            value={monthDay}
            onChange={(e) => setMonthDay(Number(e.target.value))}
            className="text-sm bg-muted rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            {MONTH_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}号
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom cron input */}
      {mode === "custom" && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Cron 表达式</label>
          <input
            type="text"
            value={customDraft}
            onChange={handleCustomChange}
            placeholder="0 8 * * *"
            className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            格式: 分 时 日 月 周
          </p>
        </div>
      )}

      {/* Description */}
      {value && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <span className="font-mono text-xs text-foreground/70">{value}</span>
          <span className="mx-2">·</span>
          {describeCron(value)}
        </div>
      )}
    </div>
  );
}
