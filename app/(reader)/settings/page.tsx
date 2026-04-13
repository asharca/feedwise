"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft, Sun, Moon, Monitor, Upload, Download, Trash2, RefreshCw, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const themes = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch("/api/feeds")
      .then((r) => r.json())
      .then((data) => { if (data.success) setSubs(data.data); });
  }, []);

  async function handleExportOPML() {
    const res = await fetch("/api/opml/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "feedwise-subscriptions.opml";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportOPML() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".opml,.xml";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      await fetch("/api/opml/import", { method: "POST", body: formData });
      const data = await fetch("/api/feeds").then((r) => r.json());
      if (data.success) setSubs(data.data);
    };
    input.click();
  }

  async function handleSyncAll() {
    if (syncing) return;
    setSyncing(true);
    try {
      await fetch("/api/feeds/sync", { method: "POST" });
    } finally {
      setTimeout(() => setSyncing(false), 2000);
    }
  }

  async function handleIntervalChange(sub: Sub, minutes: number) {
    await fetch(`/api/feeds/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fetchIntervalMinutes: minutes }),
    });
    setSubs((prev) =>
      prev.map((s) => (s.id === sub.id ? { ...s, fetchIntervalMinutes: minutes } : s))
    );
  }

  async function handleDeleteFeed(sub: Sub) {
    const confirmed = window.confirm(`Unsubscribe from "${sub.title ?? sub.feedTitle ?? sub.url}"?`);
    if (!confirmed) return;
    await fetch(`/api/feeds/${sub.id}`, { method: "DELETE" });
    setSubs((prev) => prev.filter((s) => s.id !== sub.id));
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
    <div className="max-w-2xl mx-auto p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-8">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-xl"
          onClick={() => router.push("/reader")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
      </div>

      <div className="space-y-6">
        {/* Appearance */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Choose your preferred theme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {themes.map(({ key, label, icon: Icon }) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setTheme(key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150",
                    mounted && theme === key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted hover:bg-accent"
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Feed Management */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Feed Management</CardTitle>
            <CardDescription>Manage your RSS subscriptions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleSyncAll}
                disabled={syncing}
              >
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                {syncing ? "Syncing..." : "Sync All"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleImportOPML}
              >
                <Download className="size-4" />
                Import OPML
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleExportOPML}
              >
                <Upload className="size-4" />
                Export OPML
              </Button>
            </div>

            {/* Feed list */}
            {subs.length > 0 && (
              <div className="border border-border/50 rounded-xl divide-y divide-border/50 overflow-hidden">
                {subs.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors"
                  >
                    {sub.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
                        onChange={(e) => handleIntervalChange(sub, Number(e.target.value))}
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
                      onClick={() => handleDeleteFeed(sub)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon.</p>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
