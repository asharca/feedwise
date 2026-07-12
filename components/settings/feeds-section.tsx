"use client";

import { useState } from "react";
import {
  RefreshCw,
  Download,
  Upload,
  Clock,
  Trash2,
  Sparkles,
  FolderTree,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
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

interface ProposedFolder {
  name: string;
  feedIds: string[];
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
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [proposal, setProposal] = useState<ProposedFolder[] | null>(null);
  const [applying, setApplying] = useState(false);

  // Map for quick title lookup in the proposal dialog
  const subByFeedId = new Map(subs.map((s) => [s.feedId, s]));

  async function handleAutoGroup() {
    setGroupOpen(true);
    setGroupLoading(true);
    setProposal(null);
    try {
      const res = await fetch("/api/feeds/auto-group", { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { folders: ProposedFolder[] };
      };
      if (!data.success || !data.data) {
        toast.error(data.error ?? "AI grouping failed");
        setGroupOpen(false);
        return;
      }
      setProposal(data.data.folders);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI grouping failed");
      setGroupOpen(false);
    } finally {
      setGroupLoading(false);
    }
  }

  async function handleApply() {
    if (!proposal) return;
    setApplying(true);
    try {
      const res = await fetch("/api/feeds/auto-group/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: proposal }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { foldersTouched: number; subscriptionsMoved: number };
      };
      if (!data.success) {
        toast.error(data.error ?? "Failed to apply grouping");
        return;
      }
      toast.success(
        `Moved ${data.data?.subscriptionsMoved ?? 0} feed${data.data?.subscriptionsMoved === 1 ? "" : "s"} into ${data.data?.foldersTouched ?? 0} folder${data.data?.foldersTouched === 1 ? "" : "s"}.`,
      );
      setGroupOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply grouping");
    } finally {
      setApplying(false);
    }
  }

  const totalFeedsInProposal = proposal?.reduce((sum, f) => sum + f.feedIds.length, 0) ?? 0;
  const uncoveredCount = proposal !== null ? Math.max(0, subs.length - totalFeedsInProposal) : 0;

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
          <Button variant="outline" size="sm" className="rounded-md" onClick={onImportOPML}>
            <Download className="size-4" />
            Import OPML
          </Button>
          <Button variant="outline" size="sm" className="rounded-md" onClick={onExportOPML}>
            <Upload className="size-4" />
            Export OPML
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={handleAutoGroup}
            disabled={subs.length === 0 || groupLoading}
            title="Let the AI cluster your feeds into topic folders"
          >
            <Sparkles className="size-4" />
            Auto-group with AI
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
                    aria-label={`Refresh interval for ${sub.title ?? sub.feedTitle ?? sub.url}`}
                    className="min-h-9 cursor-pointer rounded-md border border-input bg-muted px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                  aria-label={`Delete ${sub.title ?? sub.feedTitle ?? sub.url}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="!max-w-none rounded-lg w-[min(95vw,860px)] h-[min(85vh,720px)] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <FolderTree className="size-4" />
              <span>AI folder proposal</span>
              {proposal && (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {proposal.length} folder{proposal.length === 1 ? "" : "s"} ·{" "}
                  {totalFeedsInProposal}/{subs.length} feeds
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            {groupLoading || !proposal ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-12">
                <Loader2 className="size-5 animate-spin" />
                <p className="text-sm">Asking the model to organise your feeds…</p>
                <p className="text-[11px] text-muted-foreground/70">Takes a few seconds.</p>
              </div>
            ) : proposal.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-12">
                <p className="text-sm">The model didn&rsquo;t return any folders.</p>
                <p className="text-[11px] text-muted-foreground/70">
                  Try again, or rerun after subscribing to a few more feeds.
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-3">
                {proposal.map((folder) => (
                  <div key={folder.name} className="rounded-md border border-border bg-card">
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <div className="text-sm font-semibold tracking-tight">{folder.name}</div>
                      <div className="text-[11px] tabular-nums text-muted-foreground">
                        {folder.feedIds.length} feed{folder.feedIds.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <ul className="divide-y divide-border">
                      {folder.feedIds.map((feedId) => {
                        const sub = subByFeedId.get(feedId);
                        return (
                          <li key={feedId} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                            {sub?.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={sub.iconUrl}
                                alt=""
                                loading="lazy"
                                decoding="sync"
                                className="size-4 rounded-sm shrink-0"
                              />
                            ) : (
                              <div className="size-4 rounded-sm bg-muted shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate">
                                {sub?.title ?? sub?.feedTitle ?? feedId}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {sub?.url ?? ""}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {uncoveredCount > 0 && (
                  <p className="text-[11px] text-muted-foreground px-1">
                    {uncoveredCount} feed{uncoveredCount === 1 ? "" : "s"} not in the proposal will
                    keep their current folder.
                  </p>
                )}
              </div>
            )}
          </div>

          {proposal && proposal.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <p className="text-[11px] text-muted-foreground">
                Existing folders with the same name are reused. Applying won&rsquo;t delete
                anything.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-md"
                  onClick={() => setGroupOpen(false)}
                  disabled={applying}
                >
                  Cancel
                </Button>
                <Button size="sm" className="rounded-md" onClick={handleApply} disabled={applying}>
                  {applying ? "Applying…" : "Apply"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
