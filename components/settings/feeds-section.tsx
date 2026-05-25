"use client";

import { RefreshCw, Download, Upload, Clock, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Sub {
  id: string;
  feedId: string;
  title: string | null;
  feedTitle: string | null;
  url: string;
  iconUrl: string | null;
  fetchIntervalMinutes: number | null;
}

interface Props {
  subs: Sub[];
  syncing: boolean;
  onSyncAll: () => void;
  onImportOPML: () => void;
  onExportOPML: () => void;
  onIntervalChange: (sub: Sub, minutes: number) => void;
  onDeleteFeed: (sub: Sub) => void;
}

export function FeedsSection({
  subs,
  syncing,
  onSyncAll,
  onImportOPML,
  onExportOPML,
  onIntervalChange,
  onDeleteFeed,
}: Props) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Feed Management</CardTitle>
        <CardDescription>Manage your RSS subscriptions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={onSyncAll}
            disabled={syncing}
          >
            <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
            {syncing ? "Syncing..." : "Sync All"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={onImportOPML}
          >
            <Download className="size-4" />
            Import OPML
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={onExportOPML}
          >
            <Upload className="size-4" />
            Export OPML
          </Button>
        </div>

        {subs.length > 0 && (
          <div className="border border-border rounded-md divide-y divide-border overflow-y-auto scrollbar-thin max-h-96">
            {subs.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors"
              >
                {sub.iconUrl ? (
                  <img src={sub.iconUrl} alt="" className="size-4 rounded-sm shrink-0" />
                ) : (
                  <span className="size-4 rounded-sm bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {sub.title ?? sub.feedTitle ?? sub.url}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{sub.url}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Clock className="size-3 text-muted-foreground" />
                  <select
                    value={sub.fetchIntervalMinutes ?? 60}
                    onChange={(e) => onIntervalChange(sub, Number(e.target.value))}
                    className="text-xs bg-muted rounded-lg px-1.5 py-1 outline-none cursor-pointer"
                  >
                    <option value={5}>5m</option>
                    <option value={15}>15m</option>
                    <option value={30}>30m</option>
                    <option value={60}>1h</option>
                    <option value={120}>2h</option>
                    <option value={360}>6h</option>
                    <option value={720}>12h</option>
                    <option value={1440}>24h</option>
                  </select>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-lg shrink-0 text-destructive hover:text-destructive"
                  onClick={() => onDeleteFeed(sub)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
