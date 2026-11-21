"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CopyButton,
  SectionErrorState,
  SectionLoadingState,
} from "@/components/settings/section-state";
import type { ApiAccessDto } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

const CLIENT_GUIDES = [
  {
    name: "Reeder（iOS / macOS）",
    protocol: "Google Reader / Fever",
    steps:
      "添加账号 → 选择「FreshRSS / Google Reader」或「Fever」，填入上方接口地址、用户名与 API 密码。",
  },
  {
    name: "NetNewsWire（iOS / macOS）",
    protocol: "FreshRSS（Google Reader）",
    steps:
      "添加账号 → 选择「FreshRSS」，Server 填写 Google Reader API 地址，输入用户名和 API 密码。",
  },
  {
    name: "Read You（Android）",
    protocol: "Google Reader / Fever",
    steps: "账号管理 → 添加「Google Reader」或「Fever」账号，粘贴对应接口地址并登录。",
  },
  {
    name: "FeedMe（Android）",
    protocol: "Google Reader / Fever",
    steps: "选择「Self-hosted / FreshRSS」或「Fever」，填入上方接口地址、用户名与 API 密码。",
  },
  {
    name: "Fluent Reader（桌面 / 移动）",
    protocol: "Google Reader / Fever",
    steps: "设置 → 服务 → 选择「Google Reader API」或「Fever API」，填入对应地址和凭据。",
  },
] as const;

export function ClientsSection() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const apiAccessQuery = useQuery({
    queryKey: queryKeys.settings.apiAccess(),
    queryFn: () => apiFetch<ApiAccessDto>("/api/settings/api-access"),
  });

  const setPasswordMutation = useMutation({
    mutationFn: (nextPassword: string) =>
      apiFetch<ApiAccessDto>("/api/settings/api-access", {
        method: "PUT",
        json: { password: nextPassword },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.settings.apiAccess(), updated);
      setPassword("");
      setConfirmPassword("");
      setFormError(null);
      toast.success("API 密码已设置（旧客户端会话已失效）");
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "设置 API 密码失败");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => apiFetch<ApiAccessDto>("/api/settings/api-access", { method: "DELETE" }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.settings.apiAccess(), updated);
      toast.success("已撤销第三方客户端访问凭证");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "撤销访问凭证失败");
    },
  });

  if (apiAccessQuery.isPending) {
    return <SectionLoadingState label="第三方客户端接入配置" />;
  }

  if (apiAccessQuery.isError || !apiAccessQuery.data) {
    return (
      <SectionErrorState
        label="第三方客户端接入配置"
        error={apiAccessQuery.error ?? new Error("未返回配置数据")}
        onRetry={() => void apiAccessQuery.refetch()}
      />
    );
  }

  const data = apiAccessQuery.data;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setFormError("API 密码长度至少为 8 位");
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setFormError("两次输入的密码不一致");
      return;
    }
    setFormError(null);
    setPasswordMutation.mutate(password);
  }

  function handleRevoke() {
    if (!window.confirm("确定要撤销 API 密码及全部已登录的第三方客户端令牌吗？")) return;
    revokeMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="size-4" />
            第三方阅读器接入
            <Badge variant={data.configured ? "secondary" : "outline"}>
              {data.configured ? "已启用" : "未配置"}
            </Badge>
          </CardTitle>
          <CardDescription>
            同时兼容 Google Reader API 与 Fever API。请设置独立的客户端专用 API
            密码，而非你的网页登录密码。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Credentials & URLs */}
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">用户名（邮箱）</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs">
                  {data.username}
                </code>
                <CopyButton value={data.username} />
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Google Reader API 地址</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs">
                  {data.greaderUrl}
                </code>
                <CopyButton value={data.greaderUrl} />
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground block">Fever API 地址</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs">
                  {data.feverUrl}
                </code>
                <CopyButton value={data.feverUrl} />
              </div>
            </div>
          </div>

          {/* Password form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                {data.configured ? "重置 API 密码" : "设置 API 密码"}
              </h3>
              {data.configured && (
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  className="rounded-md"
                  onClick={handleRevoke}
                  disabled={revokeMutation.isPending}
                >
                  <ShieldOff className="size-3" />
                  {revokeMutation.isPending ? "撤销中…" : "撤销访问权限"}
                </Button>
              )}
            </div>

            {formError && (
              <p role="alert" className="text-xs text-destructive">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="api-password" className="text-xs text-muted-foreground block mb-1">
                  新 API 密码（至少 8 位）
                </label>
                <Input
                  id="api-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="输入至少 8 位密码"
                  autoComplete="new-password"
                  className="h-9 bg-muted"
                />
              </div>
              <div>
                <label
                  htmlFor="api-password-confirm"
                  className="text-xs text-muted-foreground block mb-1"
                >
                  确认 API 密码（可选）
                </label>
                <Input
                  id="api-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="再次输入以确认"
                  autoComplete="new-password"
                  className="h-9 bg-muted"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                className="rounded-md"
                disabled={setPasswordMutation.isPending || password.length === 0}
              >
                {setPasswordMutation.isPending
                  ? "保存中…"
                  : data.configured
                    ? "重置密码"
                    : "启用 API 访问"}
              </Button>
              {data.configured && (
                <span className="text-[11px] text-muted-foreground">
                  重置密码后，已登录的客户端需要重新输入新密码。
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base">常见客户端配置指引</CardTitle>
          <CardDescription>主流跨平台 RSS 客户端的接入方式</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border rounded-md border border-border">
            {CLIENT_GUIDES.map((guide) => (
              <li key={guide.name} className="px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{guide.name}</span>
                  <Badge variant="outline">{guide.protocol}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{guide.steps}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
