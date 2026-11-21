"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import {
  PICKER_FIELDS,
  RULE_ACTION_LABELS,
  RULE_FIELD_LABELS,
  RULE_OPERATOR_LABELS,
  createActionForType,
  createDefaultCondition,
  getAllowedActionTypesForScope,
  getAllowedFieldsForScope,
  getAllowedOperatorsForField,
  sanitizeDraftForScope,
  validateRuleConditions,
  validateRuleDraft,
} from "@/components/settings/rule-validation";
import type {
  FolderItem,
  NotificationChannelDto,
  RuleDto,
  RulePreviewMatch,
  Sub,
  TagItem,
} from "@/components/settings/types";
import type {
  RuleAction,
  RuleCondition,
  RuleField,
  RuleMatchMode,
  RuleOperator,
  RuleScope,
} from "@/lib/db/schema-types";
import type { HotBoard } from "@/lib/hot/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

interface RuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RuleDto | null;
}

const SELECT_CLS =
  "h-9 cursor-pointer rounded-md border border-input bg-muted px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface RuleEditorFormProps {
  rule: RuleDto | null;
  onClose: () => void;
}

function RuleEditorForm({ rule, onClose }: RuleEditorFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(rule?.name ?? "");
  const [scope, setScope] = useState<RuleScope>(rule?.scope ?? "article");
  const [matchMode, setMatchMode] = useState<RuleMatchMode>(rule?.matchMode ?? "all");
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rule?.conditions.length ? rule.conditions : [createDefaultCondition(rule?.scope ?? "article")],
  );
  const [actions, setActions] = useState<RuleAction[]>(
    rule?.actions.length ? rule.actions : [{ type: "markRead" }],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const feedsQuery = useQuery({
    queryKey: queryKeys.feeds.list(),
    queryFn: () => apiFetch<Sub[]>("/api/feeds"),
  });

  const foldersQuery = useQuery({
    queryKey: queryKeys.folders.all,
    queryFn: () => apiFetch<FolderItem[]>("/api/folders"),
  });

  const tagsQuery = useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: () => apiFetch<TagItem[]>("/api/tags"),
  });

  const channelsQuery = useQuery({
    queryKey: queryKeys.notificationChannels.all,
    queryFn: () => apiFetch<NotificationChannelDto[]>("/api/notification-channels"),
  });

  const hotBoardsQuery = useQuery({
    queryKey: queryKeys.hot.boards("all"),
    queryFn: () => apiFetch<{ boards: HotBoard[] }>("/api/hot?category=all"),
    enabled: scope === "hot",
  });

  const previewMutation = useMutation({
    mutationFn: (payload: {
      scope: RuleScope;
      matchMode: RuleMatchMode;
      conditions: RuleCondition[];
    }) =>
      apiFetch<{ matches: RulePreviewMatch[] }>("/api/rules/preview", {
        method: "POST",
        json: payload,
      }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "预览匹配失败");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      enabled: boolean;
      scope: RuleScope;
      matchMode: RuleMatchMode;
      conditions: RuleCondition[];
      actions: RuleAction[];
    }) =>
      rule
        ? apiFetch<RuleDto>(`/api/rules/${rule.id}`, { method: "PATCH", json: payload })
        : apiFetch<RuleDto>("/api/rules", { method: "POST", json: payload }),
    onSuccess: () => {
      toast.success(rule ? "规则已更新" : "规则已创建");
      void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all });
      onClose();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "保存规则失败");
    },
  });

  const subs = feedsQuery.data ?? [];
  const tags = tagsQuery.data ?? [];
  const channels = channelsQuery.data ?? [];
  const hotSources = (hotBoardsQuery.data?.boards ?? []).map((b) => b.source);

  // Merge folders from /api/folders with any folderId references from /api/feeds.
  const folderOptions: Array<{ id: string; name: string }> = [];
  const seenFolders = new Set<string>();
  for (const folder of foldersQuery.data ?? []) {
    seenFolders.add(folder.id);
    folderOptions.push({ id: folder.id, name: folder.name });
  }
  for (const sub of subs) {
    if (sub.folderId && !seenFolders.has(sub.folderId)) {
      seenFolders.add(sub.folderId);
      folderOptions.push({ id: sub.folderId, name: sub.folderId });
    }
  }

  function handleScopeChange(nextScope: RuleScope) {
    setScope(nextScope);
    setFormError(null);
    previewMutation.reset();
    const sanitized = sanitizeDraftForScope(nextScope, conditions, actions);
    setConditions(sanitized.conditions);
    setActions(sanitized.actions);
  }

  function updateCondition(index: number, patch: Partial<RuleCondition>) {
    setFormError(null);
    setConditions((prev) =>
      prev.map((cond, i) => {
        if (i !== index) return cond;
        const nextField = patch.field ?? cond.field;
        const allowedOps = getAllowedOperatorsForField(nextField);
        let nextOp = patch.op ?? cond.op;
        let nextValue = patch.value ?? cond.value;
        if (patch.field && patch.field !== cond.field) {
          if (!allowedOps.includes(nextOp)) {
            nextOp = allowedOps[0];
          }
          if (PICKER_FIELDS[patch.field] || PICKER_FIELDS[cond.field]) {
            nextValue = "";
          }
        }
        return { field: nextField, op: nextOp, value: nextValue };
      }),
    );
  }

  function updateActionType(index: number, nextType: RuleAction["type"]) {
    setFormError(null);
    setActions((prev) =>
      prev.map((action, i) => (i === index ? createActionForType(nextType) : action)),
    );
  }

  function updateActionTag(index: number, tagId: string) {
    setFormError(null);
    setActions((prev) =>
      prev.map((action, i) =>
        i === index && action.type === "addTag" ? { type: "addTag", tagId } : action,
      ),
    );
  }

  function toggleActionChannel(index: number, channelId: string) {
    setFormError(null);
    setActions((prev) =>
      prev.map((action, i) => {
        if (i !== index || action.type !== "notify") return action;
        const exists = action.channelIds.includes(channelId);
        const channelIds = exists
          ? action.channelIds.filter((id) => id !== channelId)
          : [...action.channelIds, channelId];
        return { type: "notify", channelIds };
      }),
    );
  }

  function handlePreview() {
    const err = validateRuleConditions(scope, conditions);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    previewMutation.mutate({ scope, matchMode, conditions });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateRuleDraft({ name, scope, matchMode, conditions, actions });
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    saveMutation.mutate({
      name: name.trim(),
      enabled: rule?.enabled ?? true,
      scope,
      matchMode,
      conditions,
      actions,
    });
  }

  const allowedFields = getAllowedFieldsForScope(scope);
  const allowedActionTypes = getAllowedActionTypesForScope(scope);

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-5 pr-1">
        {formError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {formError}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="rule-name" className="text-xs font-medium text-muted-foreground block">
            规则名称
          </label>
          <Input
            id="rule-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFormError(null);
            }}
            placeholder="例如：AI 重要资讯自动加星并推送"
            maxLength={100}
            className="h-9 bg-muted"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground block">作用范围</span>
            <Segmented
              value={scope}
              onChange={handleScopeChange}
              options={[
                { value: "article", label: "文章" },
                { value: "hot", label: "热榜" },
              ]}
              aria-label="作用范围"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground block">条件匹配方式</span>
            <Segmented
              value={matchMode}
              onChange={(v) => {
                setMatchMode(v);
                setFormError(null);
              }}
              options={[
                { value: "all", label: "全部满足" },
                { value: "any", label: "任一满足" },
              ]}
              aria-label="条件匹配方式"
            />
          </div>
        </div>

        {/* Conditions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">匹配条件</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="rounded-md"
              onClick={() => setConditions((prev) => [...prev, createDefaultCondition(scope)])}
            >
              <Plus className="size-3" />
              添加条件
            </Button>
          </div>
          <div className="space-y-2">
            {conditions.map((cond, index) => {
              const allowedOps = getAllowedOperatorsForField(cond.field);
              const opOptions = allowedOps.includes(cond.op)
                ? allowedOps
                : ([cond.op, ...allowedOps] as RuleOperator[]);
              return (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row gap-2 rounded-md border border-border bg-muted/30 p-2"
                >
                  <select
                    aria-label={`条件 ${index + 1} 字段`}
                    value={cond.field}
                    onChange={(e) => updateCondition(index, { field: e.target.value as RuleField })}
                    className={cn(SELECT_CLS, "sm:w-32 shrink-0")}
                  >
                    {allowedFields.map((field) => (
                      <option key={field} value={field}>
                        {RULE_FIELD_LABELS[field]}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label={`条件 ${index + 1} 运算符`}
                    value={cond.op}
                    onChange={(e) => updateCondition(index, { op: e.target.value as RuleOperator })}
                    className={cn(SELECT_CLS, "sm:w-28 shrink-0")}
                  >
                    {opOptions.map((op) => (
                      <option key={op} value={op}>
                        {RULE_OPERATOR_LABELS[op]}
                      </option>
                    ))}
                  </select>

                  {cond.field === "feedId" ? (
                    <select
                      aria-label={`条件 ${index + 1} 订阅源`}
                      value={cond.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      className={cn(SELECT_CLS, "flex-1 min-w-0")}
                    >
                      <option value="">选择订阅源…</option>
                      {subs.map((sub) => (
                        <option key={sub.feedId} value={sub.feedId}>
                          {sub.title ?? sub.feedTitle ?? sub.url}
                        </option>
                      ))}
                    </select>
                  ) : cond.field === "folderId" ? (
                    <select
                      aria-label={`条件 ${index + 1} 文件夹`}
                      value={cond.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      className={cn(SELECT_CLS, "flex-1 min-w-0")}
                    >
                      <option value="">选择文件夹…</option>
                      {folderOptions.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  ) : cond.field === "hotSource" ? (
                    <select
                      aria-label={`条件 ${index + 1} 热榜来源`}
                      value={cond.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      className={cn(SELECT_CLS, "flex-1 min-w-0")}
                    >
                      <option value="">选择热榜来源…</option>
                      {hotSources.map((src) => (
                        <option key={src.key} value={src.key}>
                          {src.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      aria-label={`条件 ${index + 1} 匹配值`}
                      value={cond.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      placeholder={
                        cond.op === "regex" ? "输入正则表达式（不超过 200 字符）" : "输入关键词"
                      }
                      maxLength={cond.op === "regex" ? 200 : undefined}
                      className="h-9 flex-1 bg-background"
                    />
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={conditions.length <= 1}
                    onClick={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`删除条件 ${index + 1}`}
                    className="self-end sm:self-center text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              执行动作{scope === "hot" && "（热榜规则仅支持通知）"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="rounded-md"
              onClick={() =>
                setActions((prev) => [
                  ...prev,
                  createActionForType(scope === "hot" ? "notify" : "markRead"),
                ])
              }
            >
              <Plus className="size-3" />
              添加动作
            </Button>
          </div>
          <div className="space-y-2">
            {actions.map((action, index) => (
              <div
                key={index}
                className="space-y-2 rounded-md border border-border bg-muted/30 p-2"
              >
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`动作 ${index + 1} 类型`}
                    value={action.type}
                    onChange={(e) => updateActionType(index, e.target.value as RuleAction["type"])}
                    className={cn(SELECT_CLS, "w-36 shrink-0")}
                  >
                    {allowedActionTypes.map((type) => (
                      <option key={type} value={type}>
                        {RULE_ACTION_LABELS[type]}
                      </option>
                    ))}
                  </select>

                  {action.type === "addTag" && (
                    <select
                      aria-label={`动作 ${index + 1} 标签`}
                      value={action.tagId}
                      onChange={(e) => updateActionTag(index, e.target.value)}
                      className={cn(SELECT_CLS, "flex-1 min-w-0")}
                    >
                      <option value="">选择标签…</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {action.type !== "addTag" && <div className="flex-1" />}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={actions.length <= 1}
                    onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`删除动作 ${index + 1}`}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                {action.type === "addTag" && tags.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1">
                    暂无可用标签，请先在阅读器中为文章创建标签。
                  </p>
                )}

                {action.type === "notify" && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground block">
                      选择通知渠道（可多选）：
                    </span>
                    {channels.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        暂无通知渠道，请先在「通知渠道」中创建。
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {channels.map((ch) => {
                          const selected = action.channelIds.includes(ch.id);
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleActionChannel(index, ch.id)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
                                selected
                                  ? "border-primary bg-primary/15 text-foreground font-medium"
                                  : "border-border bg-background text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <span>{ch.name}</span>
                              {!ch.enabled && (
                                <span className="text-[10px] text-muted-foreground">
                                  （已停用）
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Preview Matches */}
        <div className="space-y-2 rounded-md border border-border p-3 bg-card">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">预览匹配结果</p>
              <p className="text-[11px] text-muted-foreground">
                {scope === "hot"
                  ? "使用当前热榜数据进行试运行（最多显示 20 条）"
                  : "使用近 7 天的订阅文章进行试运行（最多显示 20 条）"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md shrink-0"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Eye className="size-3.5" />
              )}
              预览匹配
            </Button>
          </div>

          {previewMutation.isSuccess && (
            <div className="pt-1">
              {previewMutation.data.matches.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">暂无匹配内容。</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      共命中 {previewMutation.data.matches.length} 条
                    </Badge>
                  </div>
                  <ul className="max-h-44 overflow-y-auto scrollbar-thin divide-y divide-border rounded-md border border-border">
                    {previewMutation.data.matches.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {item.source}
                            {item.at ? ` · ${new Date(item.at).toLocaleString("zh-CN")}` : ""}
                          </p>
                        </div>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="打开原文"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3 mt-3 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-md"
          onClick={onClose}
          disabled={saveMutation.isPending}
        >
          取消
        </Button>
        <Button type="submit" size="sm" className="rounded-md" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "保存中…" : rule ? "保存修改" : "创建规则"}
        </Button>
      </div>
    </form>
  );
}

export function RuleEditorDialog({ open, onOpenChange, rule }: RuleEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none rounded-lg w-[min(680px,94vw)] h-[min(85dvh,720px)] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{rule ? "编辑规则" : "新建规则"}</DialogTitle>
        </DialogHeader>
        {open && (
          <RuleEditorForm
            key={rule?.id ?? "new-rule"}
            rule={rule}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
