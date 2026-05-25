"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const themes = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

interface Props {
  theme?: string;
  mounted: boolean;
  onSelect: (key: string) => void;
}

export function AppearanceSection({ theme, mounted, onSelect }: Props) {
  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Choose your preferred theme</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {themes.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              onClick={() => onSelect(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150",
                mounted && theme === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted hover:bg-accent"
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
