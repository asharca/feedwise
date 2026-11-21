"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "@/components/settings/setting-row";
import { SettingsSubTabs, type SettingsSubTab } from "@/components/settings/settings-sub-tabs";
import { SectionErrorState } from "@/components/settings/section-state";
import { DigestHistorySection } from "@/components/settings/digest-history-section";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DigestPreviewResult, EmailSettings, Sub } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import CronBuilder from "@/components/cron-builder";

const HOST_REGEX =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function isSmtpConfigValid(settings: EmailSettings | null): boolean {
  if (!settings) return false;
  const { smtpHost, smtpPort, smtpUser } = settings;
  if (!smtpHost || !smtpUser) return false;
  if (!HOST_REGEX.test(smtpHost) && !IP_REGEX.test(smtpHost)) return false;
  if (smtpPort && (smtpPort < 1 || smtpPort > 65535)) return false;
  return true;
}

const SUB_TABS: SettingsSubTab[] = [
  { key: "general", label: "常规" },
  { key: "schedule", label: "发送计划" },
  { key: "smtp", label: "SMTP 发信" },
  { key: "feeds", label: "包含订阅源" },
];

export function DigestEmailSection() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("general");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [smtpPassDraft, setSmtpPassDraft] = useState("");
  const [pendingCron, setPendingCron] = useState<string | null>(null);
  const [smtpDrafts, setSmtpDrafts] = useState<{
    smtpHost?: string;
    smtpPort?: string;
    smtpFrom?: string;
    smtpUser?: string;
  }>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  const emailQuery = useQuery({
    queryKey: queryKeys.settings.email(),
    queryFn: () => apiFetch<EmailSettings>("/api/settings/email"),
  });

  const feedsQuery = useQuery({
    queryKey: queryKeys.feeds.list(),
    queryFn: () => apiFetch<Sub[]>("/api/feeds"),
  });

  const updateEmailMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      apiFetch<EmailSettings>("/api/settings/email", { method: "PUT", json: patch }),
    onSuccess: (updated, vars) => {
      queryClient.setQueryData(queryKeys.settings.email(), updated);
      setEmailError(null);
      if ("smtpPass" in vars) setSmtpPassDraft("");
      if ("cronExpression" in vars) setPendingCron(null);
      if ("smtpHost" in vars || "smtpPort" in vars || "smtpFrom" in vars || "smtpUser" in vars) {
        setSmtpDrafts({});
      }
    },
    onError: (err) => {
      setEmailError(err instanceof Error ? err.message : "保存失败");
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: () => apiFetch("/api/settings/email/test", { method: "POST" }),
    onSuccess: () => {
      setEmailError(null);
      toast.success("测试邮件已发送");
    },
    onError: (err) => {
      setEmailError(err instanceof Error ? err.message : "发送测试邮件失败");
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => apiFetch<DigestPreviewResult>("/api/email/llm/preview", { method: "POST" }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "生成邮件预览失败");
    },
  });

  function handleSmtpBlur(
    field: "smtpHost" | "smtpPort" | "smtpFrom" | "smtpUser" | "smtpPass",
    value: string | number,
  ) {
    setEmailError(null);
    if (field === "smtpHost" && typeof value === "string" && value.trim()) {
      if (!HOST_REGEX.test(value.trim()) && !IP_REGEX.test(value.trim())) {
        setEmailError("SMTP 主机格式无效");
        return;
      }
    }
    if (field === "smtpPort" && value !== "") {
      const port = typeof value === "string" ? parseInt(value, 10) : value;
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        setEmailError("SMTP 端口无效（需在 1-65535 之间）");
        return;
      }
      updateEmailMutation.mutate({ smtpPort: port });
      return;
    }
    updateEmailMutation.mutate({ [field]: value });
  }

  function handleFeedToggle(feedId: string) {
    const settings = emailQuery.data;
    if (!settings) return;
    const current = settings.selectedFeeds ?? [];
    const next = current.includes(feedId)
      ? current.filter((id) => id !== feedId)
      : [...current, feedId];
    updateEmailMutation.mutate({ selectedFeeds: next });
  }

  function openPreview() {
    previewMutation.reset();
    setPreviewOpen(true);
    previewMutation.mutate();
  }

  const emailSettings = emailQuery.data ?? null;
  const subs = feedsQuery.data ?? [];
  const enabled = emailSettings?.enabled ?? false;
  const busy = updateEmailMutation.isPending || testEmailMutation.isPending;

  const smtpHostValue = smtpDrafts.smtpHost ?? emailSettings?.smtpHost ?? "";
  const smtpPortValue = smtpDrafts.smtpPort ?? String(emailSettings?.smtpPort ?? "");
  const smtpFromValue = smtpDrafts.smtpFrom ?? emailSettings?.smtpFrom ?? "";
  const smtpUserValue = smtpDrafts.smtpUser ?? emailSettings?.smtpUser ?? "";
  const effectiveSettings: EmailSettings | null = emailSettings
    ? {
        ...emailSettings,
        smtpHost: smtpHostValue,
        smtpPort: parseInt(smtpPortValue, 10) || emailSettings.smtpPort,
        smtpUser: smtpUserValue,
      }
    : null;

  return (
    <div className="space-y-4">
      {feedsQuery.isError && (
        <SectionErrorState
          label="订阅源列表"
          error={feedsQuery.error}
          onRetry={() => void feedsQuery.refetch()}
        />
      )}

      {emailQuery.isError ? (
        <SectionErrorState
          label="邮件摘要设置"
          error={emailQuery.error}
          onRetry={() => void emailQuery.refetch()}
        />
      ) : (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4" />
              每日邮件摘要
            </CardTitle>
            <CardDescription>按计划将订阅文章汇总发送到你的邮箱</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {emailQuery.isPending || !emailSettings ? (
              <div className="space-y-4">
                <div className="h-6 bg-muted rounded animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
                <div className="h-32 bg-muted rounded animate-pulse" />
              </div>
            ) : (
              <>
                {enabled && <SettingsSubTabs tabs={SUB_TABS} active={tab} onChange={setTab} />}

                {(tab === "general" || !enabled) && (
                  <div className="divide-y divide-border">
                    <SettingRow
                      title="启用邮件摘要"
                      description="定时接收订阅文章汇总邮件"
                      control={
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) =>
                            updateEmailMutation.mutate({ enabled: checked })
                          }
                          disabled={busy}
                          aria-label="启用邮件摘要"
                        />
                      }
                    />
                    {enabled && (
                      <>
                        <SettingRow
                          title="点击文章时标记已读"
                          description="从邮件打开文章时自动在 Feedwise 中标为已读"
                          control={
                            <Switch
                              checked={emailSettings.markReadOnClick ?? true}
                              onCheckedChange={(checked) =>
                                updateEmailMutation.mutate({ markReadOnClick: checked })
                              }
                              disabled={updateEmailMutation.isPending}
                              aria-label="点击文章时标记已读"
                            />
                          }
                        />
                        <SettingRow
                          title="点击文章时自动加星"
                          description="从邮件打开文章时同时收藏（加星）"
                          control={
                            <Switch
                              checked={emailSettings.autoSaveOnClick ?? false}
                              onCheckedChange={(checked) =>
                                updateEmailMutation.mutate({ autoSaveOnClick: checked })
                              }
                              disabled={updateEmailMutation.isPending}
                              aria-label="点击文章时自动加星"
                            />
                          }
                        />
                      </>
                    )}
                  </div>
                )}

                {enabled && tab === "schedule" && (
                  <div className="pt-1">
                    <CronBuilder
                      value={pendingCron ?? emailSettings.cronExpression}
                      onChange={setPendingCron}
                      disabled={busy}
                    />
                    {pendingCron !== null && pendingCron !== emailSettings.cronExpression && (
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          className="rounded-md"
                          disabled={updateEmailMutation.isPending}
                          onClick={() =>
                            updateEmailMutation.mutate({ cronExpression: pendingCron })
                          }
                        >
                          {updateEmailMutation.isPending ? "保存中…" : "保存发送计划"}
                        </Button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setPendingCron(null)}
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {enabled && tab === "smtp" && (
                  <div className="space-y-3 pt-1">
                    {emailError && (
                      <div className="p-2 bg-destructive/10 text-destructive text-sm rounded-md">
                        {emailError}
                      </div>
                    )}
                    <div>
                      <label
                        htmlFor="smtp-host"
                        className="text-xs text-muted-foreground block mb-1"
                      >
                        SMTP 服务器
                      </label>
                      <Input
                        id="smtp-host"
                        type="text"
                        placeholder="smtp.gmail.com"
                        value={smtpHostValue}
                        onChange={(e) =>
                          setSmtpDrafts((prev) => ({ ...prev, smtpHost: e.target.value }))
                        }
                        onBlur={(e) => handleSmtpBlur("smtpHost", e.target.value)}
                        disabled={busy}
                        className="h-10 bg-muted"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="smtp-port"
                          className="text-xs text-muted-foreground block mb-1"
                        >
                          端口
                        </label>
                        <Input
                          id="smtp-port"
                          type="number"
                          placeholder="587"
                          value={smtpPortValue}
                          onChange={(e) =>
                            setSmtpDrafts((prev) => ({ ...prev, smtpPort: e.target.value }))
                          }
                          onBlur={(e) =>
                            handleSmtpBlur("smtpPort", parseInt(e.target.value, 10) || 587)
                          }
                          disabled={busy}
                          className="h-10 bg-muted"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="smtp-from"
                          className="text-xs text-muted-foreground block mb-1"
                        >
                          发件人名称
                        </label>
                        <Input
                          id="smtp-from"
                          type="text"
                          placeholder="Feedwise"
                          value={smtpFromValue}
                          onChange={(e) =>
                            setSmtpDrafts((prev) => ({ ...prev, smtpFrom: e.target.value }))
                          }
                          onBlur={(e) => handleSmtpBlur("smtpFrom", e.target.value)}
                          disabled={busy}
                          className="h-10 bg-muted"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="smtp-user"
                        className="text-xs text-muted-foreground block mb-1"
                      >
                        用户名 / 邮箱
                      </label>
                      <Input
                        id="smtp-user"
                        type="text"
                        placeholder="your-email@gmail.com"
                        value={smtpUserValue}
                        onChange={(e) =>
                          setSmtpDrafts((prev) => ({ ...prev, smtpUser: e.target.value }))
                        }
                        onBlur={(e) => handleSmtpBlur("smtpUser", e.target.value)}
                        disabled={busy}
                        className="h-10 bg-muted"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="smtp-pass"
                        className="text-xs text-muted-foreground block mb-1"
                      >
                        密码 / 应用专用密码
                      </label>
                      <Input
                        id="smtp-pass"
                        type="password"
                        placeholder={
                          emailSettings.hasSmtpPass ? "已设置，留空保持不变" : "输入密码或授权码"
                        }
                        value={smtpPassDraft}
                        onChange={(e) => setSmtpPassDraft(e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value) handleSmtpBlur("smtpPass", e.target.value);
                        }}
                        disabled={busy}
                        autoComplete="new-password"
                        className="h-10 bg-muted"
                      />
                      {emailSettings.hasSmtpPass && (
                        <p className="mt-1 text-xs text-muted-foreground">SMTP 密码已保存。</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        onClick={openPreview}
                        title="预览下一封摘要邮件的渲染效果"
                      >
                        <Eye className="size-4 mr-2" />
                        预览邮件
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        onClick={() => testEmailMutation.mutate()}
                        disabled={
                          busy ||
                          !isSmtpConfigValid(effectiveSettings) ||
                          (!emailSettings.hasSmtpPass && smtpPassDraft.trim().length === 0)
                        }
                      >
                        <Mail className="size-4 mr-2" />
                        {testEmailMutation.isPending ? "发送中…" : "发送测试邮件"}
                      </Button>
                    </div>
                  </div>
                )}

                {enabled &&
                  tab === "feeds" &&
                  (subs.length > 0 ? (
                    <div className="pt-1">
                      <div className="border border-border rounded-md divide-y divide-border max-h-80 overflow-y-auto scrollbar-thin">
                        {subs.map((sub) => {
                          const checked = (emailSettings.selectedFeeds ?? []).includes(sub.feedId);
                          return (
                            <button
                              type="button"
                              key={sub.id}
                              onClick={() => handleFeedToggle(sub.feedId)}
                              disabled={busy}
                              aria-checked={checked}
                              role="checkbox"
                              className="w-full text-left flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/30 disabled:opacity-60"
                            >
                              <div
                                className={cn(
                                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                  checked ? "bg-primary border-primary" : "border-muted-foreground",
                                )}
                              >
                                {checked && <Check className="size-3 text-primary-foreground" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">
                                  {sub.title ?? sub.feedTitle ?? sub.url}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {(emailSettings.selectedFeeds ?? []).length === 0
                          ? "未单独选择时默认包含全部订阅源"
                          : `已选择 ${(emailSettings.selectedFeeds ?? []).length} 个订阅源`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground pt-2">暂无可选订阅源。</p>
                  ))}
              </>
            )}
          </CardContent>

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="!max-w-none rounded-lg w-[min(1100px,96vw)] h-[min(88vh,820px)] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 flex-wrap pr-6">
                  <span>邮件预览</span>
                  {previewMutation.data && (
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      共 {previewMutation.data.articleCount} 篇文章
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-hidden rounded-md border border-border bg-background relative">
                {previewMutation.isPending && (
                  <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center py-2 bg-background/80 backdrop-blur-sm text-xs text-muted-foreground">
                    <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin mr-2" />
                    正在生成预览…
                  </div>
                )}
                {previewMutation.data?.html ? (
                  <iframe
                    title="邮件预览"
                    srcDoc={previewMutation.data.html}
                    sandbox=""
                    className="w-full h-full bg-white"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    正在构建邮件内容…
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </Card>
      )}

      <DigestHistorySection />
    </div>
  );
}
