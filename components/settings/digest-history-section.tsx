"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Send, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailPreviewDialog } from "@/components/settings/email-preview-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DigestLog {
  id: string;
  sentAt: string;
  articleCount: number | null;
  status: "success" | "failed" | null;
  errorMessage: string | null;
}

export function DigestHistorySection() {
  const [logs, setLogs] = useState<DigestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, "preview" | "resend" | null>>({});
  const [previewLogId, setPreviewLogId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [logsVersion, setLogsVersion] = useState(0);

  function refetchLogs() {
    setLogsVersion((v) => v + 1);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/email/history")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) setLogs(data.data ?? []);
      })
      .catch(() => {
        // Non-fatal — section just stays empty
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logsVersion]);

  async function handlePreview(logId: string) {
    setPending((p) => ({ ...p, [logId]: "preview" }));
    setPreviewLogId(logId);
    setPreviewOpen(true);
    setPending((p) => ({ ...p, [logId]: null }));
  }

  async function handleResend(log: DigestLog) {
    if (log.articleCount === 0) return;
    setPending((p) => ({ ...p, [log.id]: "resend" }));
    try {
      const res = await fetch(`/api/settings/email/history/${log.id}/resend`, { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "Resend failed");
        return;
      }
      toast.success(`Digest resent to ${data.data.sentTo}`);
      refetchLogs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setPending((p) => ({ ...p, [log.id]: null }));
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Digest history</CardTitle>
        <CardDescription>
          The last 30 digest sends, including any failures with their reason.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No digests have been sent yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const ok = log.status === "success";
              const date = new Date(log.sentAt);
              const expanded = expandedId === log.id;
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
                        {ok
                          ? `Sent ${log.articleCount ?? 0} article${log.articleCount === 1 ? "" : "s"}`
                          : "Send failed"}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatDistanceToNow(date, { addSuffix: true })}
                        {" · "}
                        {date.toLocaleString()}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md shrink-0"
                      onClick={() => handlePreview(log.id)}
                      title="Preview this digest"
                      disabled={pending[log.id] !== undefined && pending[log.id] !== null}
                    >
                      {pending[log.id] === "preview" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md shrink-0"
                      onClick={() => handleResend(log)}
                      title={log.articleCount === 0 ? "Nothing to resend" : "Resend this digest"}
                      disabled={(log.articleCount ?? 0) === 0 || (pending[log.id] ?? null) !== null}
                    >
                      {pending[log.id] === "resend" ? (
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
                        aria-label={expanded ? "Hide error" : "Show error"}
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
