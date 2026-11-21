"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionErrorState, SectionLoadingState } from "@/components/settings/section-state";
import type { UserAccount } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

export function AccountSection() {
  const queryClient = useQueryClient();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);

  const accountQuery = useQuery({
    queryKey: queryKeys.settings.account(),
    queryFn: () => apiFetch<UserAccount>("/api/settings/account"),
  });

  const updateAccountMutation = useMutation({
    mutationFn: (payload: { name?: string; email?: string }) =>
      apiFetch<UserAccount>("/api/settings/account", { method: "PUT", json: payload }),
    onSuccess: (updated, vars) => {
      queryClient.setQueryData(queryKeys.settings.account(), updated);
      if (vars.name !== undefined) {
        setNameDraft(null);
        toast.success("昵称已更新");
      }
      if (vars.email !== undefined) {
        setEmailDraft(null);
        toast.success("邮箱已更新");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "保存账号信息失败");
    },
  });

  if (accountQuery.isPending) {
    return <SectionLoadingState label="账号信息" />;
  }

  if (accountQuery.isError || !accountQuery.data) {
    return (
      <SectionErrorState
        label="账号信息"
        error={accountQuery.error ?? new Error("未返回账号信息")}
        onRetry={() => void accountQuery.refetch()}
      />
    );
  }

  const account = accountQuery.data;
  const currentName = nameDraft ?? account.name ?? "";
  const currentEmail = emailDraft ?? account.email ?? "";

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">账号信息</CardTitle>
        <CardDescription>查看和修改你的个人资料</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {account.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.image} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <User className="size-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium">{account.name || "未命名用户"}</p>
              <p className="text-xs text-muted-foreground">{account.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="size-3" />
            <span>加入时间：{new Date(account.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
          <div className="pt-2 border-t border-border">
            <label htmlFor="user-name" className="text-xs text-muted-foreground block mb-1">
              显示名称
            </label>
            <div className="flex gap-2">
              <Input
                id="user-name"
                type="text"
                placeholder="输入你的昵称"
                value={currentName}
                onChange={(e) => setNameDraft(e.target.value)}
                autoComplete="name"
                className="h-10 flex-1 bg-muted"
              />
              <Button
                size="sm"
                className="rounded-md"
                disabled={updateAccountMutation.isPending}
                onClick={() => updateAccountMutation.mutate({ name: currentName })}
              >
                保存
              </Button>
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <label htmlFor="user-email" className="text-xs text-muted-foreground block mb-1">
              邮箱地址
            </label>
            <div className="flex gap-2">
              <Input
                id="user-email"
                type="email"
                placeholder="输入你的邮箱"
                value={currentEmail}
                onChange={(e) => setEmailDraft(e.target.value)}
                autoComplete="email"
                className="h-10 flex-1 bg-muted"
              />
              <Button
                size="sm"
                className="rounded-md"
                disabled={updateAccountMutation.isPending}
                onClick={() => updateAccountMutation.mutate({ email: currentEmail })}
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
