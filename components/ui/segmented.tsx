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
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      data-slot="segmented"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-sm font-medium transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
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
