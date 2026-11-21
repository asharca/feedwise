"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Terminal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/settings/section-state";
import type { UserAccount } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

const emptySubscribe = () => () => {};

export function McpSection() {
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "https://your-feedwise-domain",
  );

  const accountQuery = useQuery({
    queryKey: queryKeys.settings.account(),
    queryFn: () => apiFetch<UserAccount>("/api/settings/account"),
  });

  const userEmail = accountQuery.data?.email || "you@example.com";
  const mcpUrl = `${origin}/api/mcp`;

  const remoteConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        feedwise: {
          url: mcpUrl,
        },
      },
    },
    null,
    2,
  );

  const stdioCommand = `FEEDWISE_USER_EMAIL=${userEmail} pnpm mcp`;

  const stdioConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        feedwise: {
          command: "pnpm",
          args: ["mcp"],
          env: {
            FEEDWISE_USER_EMAIL: userEmail,
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="size-4" />
            MCP / AI 助手接入
            <Badge variant="secondary">Streamable HTTP + OAuth 2.1</Badge>
          </CardTitle>
          <CardDescription>
            让 Claude、Cursor 等支持 Model Context Protocol 的 AI
            助手直接检索你的订阅文章、热榜与阅读历史。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Remote HTTP Endpoint */}
          <div className="space-y-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium">远程 HTTP MCP 端点（推荐）</h3>
              <p className="text-xs text-muted-foreground">
                支持 OAuth 2.1 自动授权与 PKCE，适用于 Claude.ai、Claude Desktop、Cursor 等远程 MCP
                客户端。首次连接时会跳转浏览器完成授权确认。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted/50 px-2.5 py-1.5 font-mono text-xs">
                {mcpUrl}
              </code>
              <CopyButton value={mcpUrl} />
            </div>
          </div>

          {/* Remote JSON snippet */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Claude Desktop / Cursor 远程配置示例（mcp.json）
              </span>
              <CopyButton value={remoteConfigSnippet} />
            </div>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
              <code>{remoteConfigSnippet}</code>
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Local stdio */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="size-4" />
            本地 stdio 模式（备选）
          </CardTitle>
          <CardDescription>
            如果你在同一台机器上自托管运行 Feedwise，也可以通过标准输入输出（stdio）直接启动本地 MCP
            服务。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground block">命令行启动</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted/50 px-2.5 py-1.5 font-mono text-xs">
                {stdioCommand}
              </code>
              <CopyButton value={stdioCommand} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                本地 stdio 配置示例（请在仓库根目录运行）
              </span>
              <CopyButton value={stdioConfigSnippet} />
            </div>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
              <code>{stdioConfigSnippet}</code>
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
