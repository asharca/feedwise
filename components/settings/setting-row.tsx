"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  /** stack the control below the text instead of right-aligned */
  stacked?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function SettingRow({ title, description, control, stacked, className, children }: SettingRowProps) {
  return (
    <div
      className={cn(
        "flex gap-4 py-3",
        stacked ? "flex-col" : "items-center justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium leading-none">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {control && <div className="shrink-0">{control}</div>}
      {children}
    </div>
  );
}

export { SettingRow };
