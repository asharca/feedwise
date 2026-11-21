"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Authorization } from "@/lib/oauth/authorization";

export function Consent({ params, clientName }: { params: Authorization; clientName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(deny: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, deny }),
      });
      if (res.status === 401) {
        window.location.replace(
          `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`,
        );
        return;
      }
      if (!res.ok) throw new Error();
      const { redirect_to } = await res.json();
      window.location.assign(redirect_to);
    } catch {
      setError("授权请求失败。请返回客户端重新发起授权。");
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>授权 MCP 访问</CardTitle>
          <CardDescription>
            仅授权你信任的应用。授权后，应用可以读取文章、修改阅读和收藏状态、订阅信息源。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="break-all text-sm">
            <dt>应用（客户端自报名称）</dt>
            <dd>{clientName}</dd>
            <dt>回调地址</dt>
            <dd>{params.redirect_uri}</dd>
          </dl>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy} variant="outline" onClick={() => decide(true)}>
              拒绝
            </Button>
            <Button disabled={busy} onClick={() => decide(false)}>
              允许访问
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
