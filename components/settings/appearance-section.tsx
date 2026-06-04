"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { SettingRow } from "@/components/settings/setting-row";

const themeOptions: SegmentedOption<string>[] = [
  {
    value: "light",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Sun className="size-3.5" />
        Light
      </span>
    ),
  },
  {
    value: "dark",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Moon className="size-3.5" />
        Dark
      </span>
    ),
  },
  {
    value: "system",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Monitor className="size-3.5" />
        System
      </span>
    ),
  },
];

interface Props {
  theme?: string;
  mounted: boolean;
  onSelect: (key: string) => void;
}

export function AppearanceSection({ theme, mounted, onSelect }: Props) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Choose your preferred theme</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <SettingRow
          title="Theme"
          description="Light, dark, or follow your system"
          control={
            <Segmented
              value={mounted ? (theme ?? "system") : "system"}
              options={themeOptions}
              onChange={onSelect}
            />
          }
        />
      </CardContent>
    </Card>
  );
}
