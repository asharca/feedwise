"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Eye, Send, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmailPreviewDialog } from "@/components/settings/email-preview-dialog";
import type { DigestLog } from "@/components/settings/types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

export function DigestHistorySection() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewLogId, setPreviewLogId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const historyQuery = useQuery({
    queryKey: queryKeys.settings.emailHistory(),
    queryFn: () => apiFetch<DigestLog[]>("/api/settings/email/history"),
  });

  const resendMutation = useMutation({
    mutationFn: (logId: string) =>
      apiFetch<{ sentTo: string }>(`/api/settings/email/history/${logId}/resend`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      toast.success(`已重新发送至 ${res.sentTo}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.emailHistory() });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "重新发送失败");
    },
  });

  function handlePreview(logId: string) {
    setPreviewLogId(logId);
    setPreviewOpen(true);
  }

  const logs = historyQuery.data ?? [];
  const resendingId = resendMutation.isPending ? resendMutation.variables : null;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">发送历史</CardTitle>
        <CardDescription>最近 30 条邮件摘要发送记录与失败原因</CardDescription>
      </CardHeader>
      <CardContent>
        {historyQuery.isPending ? (
          <p className="text-sm text-muted-foreground">正在加载…</p>
        ) : historyQuery.isError ? (
          <p className="text-sm text-destructive">
            {historyQuery.error instanceof Error ? historyQuery.error.message : "加载历史记录失败"}
          </p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无发送记录。</p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const ok = log.status === "success";
              const date = new Date(log.sentAt);
              const expanded = expandedId === log.id;
              const isResending = resendingId === log.id;
              return (
                <li key={log.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    {ok ? (
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="size-4 text-destructive shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : log.id)}
                      className="flex-1 min-w-0 text-left"
                      disabled={ok}
                    >
                      <div className="text-sm font-medium">
                        {ok ? `已发送 ${log.articleCount ?? 0} 篇文章` : "发送失败"}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatDistanceToNow(date, { addSuffix: true, locale: zhCN })}
                        {" · "}
                        {date.toLocaleString("zh-CN")}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md shrink-0"
                      onClick={() => handlePreview(log.id)}
                      title="预览此封摘要"
                      disabled={isResending}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md shrink-0"
                      onClick={() => resendMutation.mutate(log.id)}
                      title={(log.articleCount ?? 0) === 0 ? "无文章可重发" : "重新发送此封摘要"}
                      disabled={(log.articleCount ?? 0) === 0 || isResending}
                    >
                      {isResending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                    </Button>
                    {!ok && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : log.id)}
                        className="shrink-0 text-muted-foreground"
                        aria-label={expanded ? "隐藏错误详情" : "查看错误详情"}
                      >
                        {expanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {!ok && expanded && log.errorMessage && (
                    <pre
                      className={cn(
                        "mt-2 ml-7 text-xs whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2",
                        "text-muted-foreground",
                      )}
                    >
                      {log.errorMessage}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <EmailPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} logId={previewLogId} />
      </CardContent>
    </Card>
  );
}
