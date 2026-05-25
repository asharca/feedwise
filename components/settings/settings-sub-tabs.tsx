"use client";

import { cn } from "@/lib/utils";

interface SettingsSubTab {
  key: string;
  label: string;
}

interface SettingsSubTabsProps {
  tabs: SettingsSubTab[];
  active: string;
  onChange: (key: string) => void;
}

function SettingsSubTabs({ tabs, active, onChange }: SettingsSubTabsProps) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "relative px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
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
