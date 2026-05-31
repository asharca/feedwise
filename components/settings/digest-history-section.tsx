"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
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
  }, []);

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
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className="w-full text-left flex items-center gap-3"
                    disabled={ok}
                  >
                    {ok ? (
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="size-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
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
                    </div>
                    {!ok && (
                      <span className="shrink-0 text-muted-foreground">
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </span>
                    )}
                  </button>
                  {!ok && expanded && log.errorMessage && (
                    <pre
                      className={cn(
                        "mt-2 ml-7 text-xs whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2",
                        "text-muted-foreground"
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
      </CardContent>
    </Card>
  );
}
