"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingRow } from "@/components/settings/setting-row";
import { SectionErrorState, SectionLoadingState } from "@/components/settings/section-state";
import { fetchLlmJson } from "@/components/settings/api-helpers";
import type { LlmConfig, LlmModelItem } from "@/components/settings/types";
import { queryKeys } from "@/lib/query/keys";

interface LlmDraft {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  format?: "openai" | "anthropic";
  autoSummarize?: boolean;
  autoTag?: boolean;
}

export function SmartDigestSection() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LlmDraft>({});

  const llmQuery = useQuery({
    queryKey: queryKeys.settings.llm(),
    queryFn: () => fetchLlmJson<LlmConfig>("/api/email/llm/config"),
  });

  const modelsMutation = useMutation({
    mutationFn: (payload: { baseUrl: string; apiKey?: string; format: "openai" | "anthropic" }) =>
      fetchLlmJson<{ ok?: boolean; models?: LlmModelItem[] }>("/api/email/llm/models", {
        method: "POST",
        json: payload,
      }),
    onSuccess: (res) => {
      const count = res.models?.length ?? 0;
      if (count === 0) {
        toast.warning("接口未返回可用模型");
      } else {
        toast.success(`已加载 ${count} 个模型`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? `加载模型失败：${err.message}` : "加载模型失败");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      enabled: boolean;
      baseUrl: string;
      apiKey?: string;
      model: string;
      format: "openai" | "anthropic";
      autoSummarize: boolean;
      autoTag: boolean;
    }) => fetchLlmJson<{ ok: boolean }>("/api/email/llm/config", { method: "PUT", json: payload }),
    onSuccess: (_res, vars) => {
      toast.success("AI 配置已保存");
      setDraft({});
      queryClient.setQueryData<LlmConfig>(queryKeys.settings.llm(), (prev) => ({
        enabled: vars.enabled,
        baseUrl: vars.baseUrl,
        model: vars.model,
        format: vars.format,
        autoSummarize: vars.autoSummarize,
        autoTag: vars.autoTag,
        apiKeyMask: vars.apiKey
          ? vars.apiKey.length >= 8
            ? `${vars.apiKey.slice(0, 4)}…${vars.apiKey.slice(-4)}`
            : "•••"
          : (prev?.apiKeyMask ?? ""),
      }));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "保存 AI 配置失败");
    },
  });

  const testMutation = useMutation({
    mutationFn: (payload: {
      baseUrl: string;
      apiKey?: string;
      model: string;
      format: "openai" | "anthropic";
    }) => fetchLlmJson<{ ok: boolean }>("/api/email/llm/test", { method: "POST", json: payload }),
    onSuccess: () => {
      toast.success("LLM 连接测试成功");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? `连接测试失败：${err.message}` : "连接测试失败");
    },
  });

  if (llmQuery.isPending) {
    return <SectionLoadingState label="AI / 智能摘要设置" />;
  }

  if (llmQuery.isError || !llmQuery.data) {
    return (
      <SectionErrorState
        label="AI / 智能摘要设置"
        error={llmQuery.error ?? new Error("未返回配置数据")}
        onRetry={() => void llmQuery.refetch()}
      />
    );
  }

  const config = llmQuery.data;
  const enabled = draft.enabled ?? config.enabled;
  const baseUrl = draft.baseUrl ?? config.baseUrl;
  const apiKey = draft.apiKey ?? "";
  const model = draft.model ?? config.model;
  const format = draft.format ?? config.format;
  const autoSummarize = draft.autoSummarize ?? config.autoSummarize;
  const autoTag = draft.autoTag ?? config.autoTag;
  const keyMask = config.apiKeyMask;

  const models = modelsMutation.data?.models ?? [];
  const modelsLoaded = modelsMutation.isSuccess;

  function handleSave() {
    saveMutation.mutate({
      enabled,
      baseUrl,
      apiKey: apiKey || undefined,
      model,
      format,
      autoSummarize,
      autoTag,
    });
  }

  function handleTest() {
    testMutation.mutate({
      baseUrl,
      apiKey: apiKey || undefined,
      model,
      format,
    });
  }

  function handleLoadModels() {
    if (!baseUrl.trim()) {
      toast.error("请先填写 API Base URL");
      return;
    }
    modelsMutation.mutate({
      baseUrl,
      apiKey: apiKey || undefined,
      format,
    });
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">智能摘要与 AI（Beta）</CardTitle>
        <CardDescription>
          启用后可使用你自己的模型接口进行摘要聚类、文章自动总结、自动打标和智能分组。默认关闭。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border">
          <SettingRow
            title="启用 AI 摘要聚类"
            description="发送邮件摘要前按主题分组并排序"
            control={
              <Switch
                checked={enabled}
                onCheckedChange={(v) => setDraft((prev) => ({ ...prev, enabled: v }))}
                aria-label="启用 AI 摘要聚类"
              />
            }
          />
          <SettingRow
            title="打开文章时自动生成总结"
            description="阅读文章时自动运行 AI 总结；关闭后仍可手动触发"
            control={
              <Switch
                checked={autoSummarize}
                onCheckedChange={(v) => setDraft((prev) => ({ ...prev, autoSummarize: v }))}
                disabled={!enabled}
                aria-label="打开文章时自动生成总结"
              />
            }
          />
          <SettingRow
            title="后台自动为文章打标签"
            description="后台任务每 5 分钟为最近未打标的文章自动归类（每次最多 20 篇）"
            control={
              <Switch
                checked={autoTag}
                onCheckedChange={(v) => setDraft((prev) => ({ ...prev, autoTag: v }))}
                disabled={!enabled}
                aria-label="后台自动为文章打标签"
              />
            }
          />
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">API 格式</span>
            <Segmented
              options={[
                { value: "openai", label: "OpenAI 兼容" },
                { value: "anthropic", label: "Anthropic" },
              ]}
              value={format}
              onChange={(v) => {
                setDraft((prev) => ({ ...prev, format: v }));
                modelsMutation.reset();
              }}
              aria-label="API 格式"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">API Base URL</span>
            <Input
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, baseUrl: e.target.value }));
                modelsMutation.reset();
              }}
              placeholder={
                format === "anthropic"
                  ? "https://api.anthropic.com/v1"
                  : "https://api.openai.com/v1"
              }
              className="h-10 bg-muted"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">
              API Key {keyMask && <span>· 已保存：{keyMask}</span>}
            </span>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder={
                keyMask ? "已设置，留空保持不变" : format === "anthropic" ? "sk-ant-..." : "sk-..."
              }
              autoComplete="off"
              className="h-10 bg-muted"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">模型名称</span>
            <div className="flex gap-1.5">
              <Input
                type="text"
                value={model}
                onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                placeholder={format === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini"}
                list={modelsLoaded ? "llm-models-datalist" : undefined}
                className="h-10 flex-1 bg-muted"
              />
              {modelsLoaded ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<button type="button" />}
                    aria-label="选择模型"
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md bg-muted px-2.5 text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    选择
                    <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-md max-h-72 overflow-y-auto">
                    {models.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无模型</div>
                    )}
                    {models.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        onClick={() => setDraft((prev) => ({ ...prev, model: m.id }))}
                      >
                        <span className="font-mono text-xs">{m.id}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-md shrink-0"
                  onClick={handleLoadModels}
                  disabled={modelsMutation.isPending || !baseUrl}
                  title="从配置的接口拉取 /v1/models 列表"
                >
                  {modelsMutation.isPending ? "加载中…" : "拉取模型"}
                </Button>
              )}
            </div>
            {modelsLoaded && (
              <datalist id="llm-models-datalist">
                {models.map((m) => (
                  <option key={m.id} value={m.id} />
                ))}
              </datalist>
            )}
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            className="rounded-md"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "保存中…" : "保存"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-md"
            onClick={handleTest}
            disabled={testMutation.isPending || !baseUrl || !model}
          >
            {testMutation.isPending ? "测试中…" : "测试连接"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
