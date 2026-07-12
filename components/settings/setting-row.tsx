"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** A settings row: label/description on the left, a control on the right. Provide either `control` or `children`, not both. */
interface SettingRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  /** stack the control below the text instead of right-aligned */
  stacked?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function SettingRow({
  title,
  description,
  control,
  stacked,
  className,
  children,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "flex gap-3 py-3.5",
        stacked
          ? "flex-col"
          : "flex-col items-stretch sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium leading-none">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {control && <div className="w-full shrink-0 sm:w-auto">{control}</div>}
      {children}
    </div>
  );
}

export { SettingRow };
