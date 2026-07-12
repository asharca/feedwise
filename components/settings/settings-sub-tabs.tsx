"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

interface SettingsSubTab {
  key: string;
  label: string;
}

interface SettingsSubTabsProps {
  tabs: SettingsSubTab[];
  active: string;
  onChange: (key: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

function SettingsSubTabs({ tabs, active, onChange, ...aria }: SettingsSubTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(index: number, direction: -1 | 1) {
    const next = (index + direction + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      className="flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-thin"
      {...aria}
    >
      {tabs.map((t, index) => (
        <button
          ref={(node) => {
            refs.current[index] = node;
          }}
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          tabIndex={active === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveFocus(index, -1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              moveFocus(index, 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              onChange(tabs[0].key);
              refs.current[0]?.focus();
            } else if (event.key === "End") {
              event.preventDefault();
              onChange(tabs[tabs.length - 1].key);
              refs.current[tabs.length - 1]?.focus();
            }
          }}
          className={cn(
            "relative -mb-px min-h-10 shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { SettingsSubTabs };
export type { SettingsSubTab };
