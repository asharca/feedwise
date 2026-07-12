"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
  ...aria
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      data-slot="segmented"
      className={cn(
        "inline-flex w-full items-center gap-0.5 rounded-md bg-muted p-0.5 sm:w-auto",
        className,
      )}
      {...aria}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2.5 py-1 text-sm font-medium transition-colors outline-none sm:flex-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export { Segmented };
export type { SegmentedOption };
