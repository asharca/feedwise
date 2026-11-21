"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { CronExpressionParser } from "cron-parser";
import { cn } from "@/lib/utils";
import { describeCron } from "@/lib/cron/describe";

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

function validateCron(expr: string): string | null {
  try {
    CronExpressionParser.parse(expr);
    return null;
  } catch {
    return "Cron 表达式格式无效";
  }
}

export default function CronBuilder({ value, onChange, disabled }: CronBuilderProps) {
  const fieldId = useId();
  const [mode, setMode] = useState<CronPreset>("daily");
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [customDraft, setCustomDraft] = useState(value || "");
  const [customError, setCustomError] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!value) return;
    if (value === lastEmittedRef.current) return;

    if (modeRef.current === "custom") {
      setCustomDraft(value);
      return;
    }

    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) {
      setMode("custom");
      setCustomDraft(value);
      return;
    }

    const [m, h, d, mo, wd] = parts;
    if (!/^\d+$/.test(m) || !/^\d+$/.test(h)) {
      setMode("custom");
      setCustomDraft(value);
      return;
    }

    setHour(parseInt(h, 10) || 8);
    setMinute(parseInt(m, 10) || 0);

    if (d === "*" && mo === "*" && wd === "*") {
      setMode("daily");
    } else if (d === "*" && mo === "*" && /^\d$/.test(wd)) {
      setMode("weekly");
      setWeekday(parseInt(wd, 10));
    } else if (/^\d+$/.test(d) && mo === "*" && wd === "*") {
      setMode("monthly");
      setMonthDay(parseInt(d, 10));
    } else {
      setMode("custom");
      setCustomDraft(value);
    }
  }, [value]);

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
      lastEmittedRef.current = cron;
      onChangeRef.current(cron);
    }
  }, [mode, hour, minute, weekday, monthDay, value]);

  useEffect(() => {
    return () => {
      window.clearTimeout(debounceRef.current);
    };
  }, []);

  const handleCustomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setCustomDraft(newValue);
    setCustomError(null);

    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const error = validateCron(newValue);
      if (error) {
        setCustomError(error);
      } else {
        onChangeRef.current(newValue.trim());
      }
    }, 600);
  }, []);

  const handleModeChange = useCallback(
    (newMode: CronPreset) => {
      if (newMode === "custom") {
        setCustomDraft(value || "0 8 * * *");
        setCustomError(null);
      }
      setMode(newMode);
      modeRef.current = newMode;
    },
    [value],
  );

  const presets: { key: CronPreset; label: string }[] = [
    { key: "daily", label: "每天" },
    { key: "weekly", label: "每周" },
    { key: "monthly", label: "每月" },
    { key: "custom", label: "自定义" },
  ];

  return (
    <div className={cn("space-y-3", disabled && "opacity-60")} aria-disabled={disabled}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="发送频率">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={disabled}
            onClick={() => handleModeChange(p.key)}
            className={cn(
              "min-h-10 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
              mode === p.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {mode !== "custom" && (
        <div className="flex items-center gap-3">
          <div>
            <label htmlFor={`${fieldId}-hour`} className="text-xs text-muted-foreground block mb-1">
              小时
            </label>
            <select
              id={`${fieldId}-hour`}
              disabled={disabled}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="min-h-10 min-w-16 cursor-pointer rounded-md border border-input bg-muted px-2 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed md:text-sm"
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
            <label
              htmlFor={`${fieldId}-minute`}
              className="text-xs text-muted-foreground block mb-1"
            >
              分钟
            </label>
            <select
              id={`${fieldId}-minute`}
              disabled={disabled}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="min-h-10 min-w-16 cursor-pointer rounded-md border border-input bg-muted px-2 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed md:text-sm"
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {mode === "weekly" && (
        <div className="flex gap-1.5 flex-wrap">
          {WEEKDAYS.map((wd) => (
            <button
              key={wd.value}
              type="button"
              disabled={disabled}
              onClick={() => setWeekday(wd.value)}
              className={cn(
                "min-h-10 rounded-md px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                weekday === wd.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent",
              )}
            >
              {wd.label}
            </button>
          ))}
        </div>
      )}

      {mode === "monthly" && (
        <div>
          <label htmlFor={`${fieldId}-day`} className="text-xs text-muted-foreground block mb-1">
            每月日期
          </label>
          <select
            id={`${fieldId}-day`}
            disabled={disabled}
            value={monthDay}
            onChange={(e) => setMonthDay(Number(e.target.value))}
            className="min-h-10 cursor-pointer rounded-md border border-input bg-muted px-2 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed md:text-sm"
          >
            {MONTH_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} 日
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "custom" && (
        <div>
          <label
            htmlFor={`${fieldId}-expression`}
            className="text-xs text-muted-foreground block mb-1"
          >
            Cron 表达式
          </label>
          <input
            id={`${fieldId}-expression`}
            type="text"
            disabled={disabled}
            value={customDraft}
            onChange={handleCustomChange}
            placeholder="0 8 * * *"
            className={cn(
              "min-h-10 w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed md:text-sm",
              customError && "ring-1 ring-destructive",
            )}
            spellCheck={false}
          />
          {customError ? (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {customError}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              格式：分 时 日 月 星期，例如 <span className="font-mono">0 8,18 * * *</span>
              （每日两次）
            </p>
          )}
        </div>
      )}

      {value && !customError && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <span className="font-mono text-xs text-foreground/70">{value}</span>
          <span className="mx-2">·</span>
          {describeCron(value)}
        </div>
      )}
    </div>
  );
}
