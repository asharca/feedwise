"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SectionErrorState, SectionLoadingState } from "@/components/settings/section-state";
import { RuleEditorDialog } from "@/components/settings/rule-editor-dialog";
import {
  RULE_ACTION_LABELS,
  RULE_FIELD_LABELS,
  reorderIds,
} from "@/components/settings/rule-validation";
import type { RuleDto } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

export function RulesSection() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleDto | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const rulesQuery = useQuery({
    queryKey: queryKeys.rules.all,
    queryFn: () => apiFetch<RuleDto[]>("/api/rules"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch<RuleDto>(`/api/rules/${id}`, { method: "PATCH", json: { enabled } }),
    onSuccess: (updated) => {
      queryClient.setQueryData<RuleDto[]>(queryKeys.rules.all, (prev) =>
        prev?.map((r) => (r.id === updated.id ? updated : r)),
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "切换规则状态失败");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/api/rules/${id}`, { method: "DELETE" }),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<RuleDto[]>(queryKeys.rules.all, (prev) =>
        prev?.filter((r) => r.id !== id),
      );
      toast.success("规则已删除");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "删除规则失败");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/rules/reorder", { method: "POST", json: { ids } }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "调整顺序失败");
      void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all });
    },
  });

  if (rulesQuery.isPending) {
    return <SectionLoadingState label="自动化规则" />;
  }

  if (rulesQuery.isError) {
    return (
      <SectionErrorState
        label="自动化规则"
        error={rulesQuery.error}
        onRetry={() => void rulesQuery.refetch()}
      />
    );
  }

  const rules = rulesQuery.data ?? [];

  function commitReorder(fromIndex: number, toIndex: number) {
    const ids = rules.map((r) => r.id);
    const nextIds = reorderIds(ids, fromIndex, toIndex);
    if (nextIds === ids) return;
    const byId = new Map(rules.map((r) => [r.id, r]));
    const nextRules = nextIds
      .map((id, position) => {
        const item = byId.get(id);
        return item ? { ...item, position } : null;
      })
      .filter((item): item is RuleDto => item !== null);
    queryClient.setQueryData<RuleDto[]>(queryKeys.rules.all, nextRules);
    reorderMutation.mutate(nextIds);
  }

  function handleDelete(rule: RuleDto) {
    if (!window.confirm(`确定要删除规则「${rule.name}」吗？`)) return;
    deleteMutation.mutate(rule.id);
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="size-4" />
            自动化规则
          </CardTitle>
          <CardDescription>
            按顺序自动处理新入库文章或热榜条目：标记已读、加星、隐藏、打标签、抓取全文或推送通知
          </CardDescription>
        </div>
        <Button
          size="sm"
          className="rounded-md shrink-0"
          onClick={() => {
            setEditingRule(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="size-4" />
          新建规则
        </Button>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center space-y-2">
            <p className="text-sm font-medium">还没有自动化规则</p>
            <p className="text-xs text-muted-foreground">
              例如：过滤标题含广告词的文章、将重点订阅源自动抓取全文并加星，或监听热榜关键词并发送推送。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rules.map((rule, index) => (
              <li
                key={rule.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== index) {
                    commitReorder(dragIndex, index);
                  }
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/25",
                  dragIndex === index && "opacity-50",
                )}
              >
                <GripVertical
                  className="size-4 shrink-0 cursor-grab text-muted-foreground/70"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{rule.name}</span>
                    <Badge variant={rule.scope === "hot" ? "secondary" : "outline"}>
                      {rule.scope === "hot" ? "热榜" : "文章"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {rule.matchMode === "all" ? "全部满足" : "任一满足"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    条件：
                    {rule.conditions.map((c) => RULE_FIELD_LABELS[c.field] ?? c.field).join(" / ")}
                    {" · 动作："}
                    {rule.actions.map((a) => RULE_ACTION_LABELS[a.type] ?? a.type).join("、")}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => commitReorder(index, index - 1)}
                    aria-label={`上移规则 ${rule.name}`}
                    title="上移"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === rules.length - 1 || reorderMutation.isPending}
                    onClick={() => commitReorder(index, index + 1)}
                    aria-label={`下移规则 ${rule.name}`}
                    title="下移"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(enabled) => toggleMutation.mutate({ id: rule.id, enabled })}
                    disabled={toggleMutation.isPending}
                    aria-label={`启用规则 ${rule.name}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditingRule(rule);
                      setEditorOpen(true);
                    }}
                    aria-label={`编辑规则 ${rule.name}`}
                    title="编辑"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(rule)}
                    disabled={deleteMutation.isPending}
                    aria-label={`删除规则 ${rule.name}`}
                    title="删除"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <RuleEditorDialog open={editorOpen} onOpenChange={setEditorOpen} rule={editingRule} />
    </Card>
  );
}
