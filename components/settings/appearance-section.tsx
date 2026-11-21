"use client";

import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { SettingRow } from "@/components/settings/setting-row";
import { SectionErrorState } from "@/components/settings/section-state";
import type { GeneralSettings } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

type ThemeValue = "light" | "dark" | "system";

const THEME_OPTIONS: SegmentedOption<ThemeValue>[] = [
  {
    value: "light",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Sun className="size-3.5" />
        浅色
      </span>
    ),
  },
  {
    value: "dark",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Moon className="size-3.5" />
        深色
      </span>
    ),
  },
  {
    value: "system",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Monitor className="size-3.5" />
        跟随系统
      </span>
    ),
  },
];

const emptySubscribe = () => () => {};

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const generalQuery = useQuery({
    queryKey: queryKeys.settings.general(),
    queryFn: () => apiFetch<GeneralSettings>("/api/settings"),
  });

  const patchGeneralMutation = useMutation({
    mutationFn: (patch: GeneralSettings) =>
      apiFetch<GeneralSettings>("/api/settings", { method: "PATCH", json: patch }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.settings.general(), updated);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "保存外观设置失败");
    },
  });

  function handleSelectTheme(next: ThemeValue) {
    setTheme(next);
    patchGeneralMutation.mutate({ theme: next });
  }

  const currentTheme: ThemeValue = isClient
    ? ((theme as ThemeValue | undefined) ?? generalQuery.data?.theme ?? "system")
    : "system";

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">外观</CardTitle>
        <CardDescription>选择你偏好的界面主题</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {generalQuery.isError && (
          <div className="pb-3">
            <SectionErrorState
              label="通用设置"
              error={generalQuery.error}
              onRetry={() => void generalQuery.refetch()}
            />
          </div>
        )}
        <SettingRow
          title="主题模式"
          description="浅色、深色或跟随操作系统设置"
          control={
            <Segmented
              value={currentTheme}
              options={THEME_OPTIONS}
              onChange={handleSelectTheme}
              disabled={patchGeneralMutation.isPending}
              aria-label="主题模式"
            />
          }
        />
      </CardContent>
    </Card>
  );
}
