"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft, Sun, Moon, Monitor, Upload, Download, Trash2, Plus, Copy, Check, KeyRound, RefreshCw, Clock } from "lucide-react";
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

interface ApiToken {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
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
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/feeds")
      .then((r) => r.json())
      .then((data) => { if (data.success) setSubs(data.data); });
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((data) => { if (data.success) setTokens(data.data); });
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
      router.refresh();
    };
    input.click();
  }

  async function handleCreateToken() {
    if (!newTokenName.trim() || tokenLoading) return;
    setTokenLoading(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTokenName.trim() }),
      });
      const data = await res.json() as { success: boolean; data?: { token: string; id: string; name: string; createdAt: string } };
      if (data.success && data.data) {
        setCreatedToken(data.data.token);
        setNewTokenName("");
        setTokens((prev) => [...prev, { id: data.data!.id, name: data.data!.name, lastUsedAt: null, createdAt: data.data!.createdAt }]);
      }
    } finally {
      setTokenLoading(false);
    }
  }

  async function handleDeleteToken(id: string) {
    await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    setTokens((prev) => prev.filter((t) => t.id !== id));
    if (createdToken) setCreatedToken(null);
  }

  async function handleCopyToken(token: string) {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                  key={key}
                  onClick={() => setTheme(key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150",
                    theme === key
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
                <Upload className="size-4" />
                Import OPML
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleExportOPML}
              >
                <Download className="size-4" />
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

        {/* MCP API Tokens */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base">MCP Server</CardTitle>
            <CardDescription>
              Connect Claude and other AI assistants to your RSS data via the hosted MCP endpoint
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Created token banner */}
            {createdToken && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 space-y-2">
                <p className="text-xs font-medium text-green-700 dark:text-green-400">
                  Token created — copy it now, it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-background/60 rounded-lg px-2 py-1.5 truncate">
                    {createdToken}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 rounded-lg shrink-0"
                    onClick={() => handleCopyToken(createdToken)}
                  >
                    {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Create token */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Token name (e.g. Claude Desktop)"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateToken()}
                className="flex-1 text-sm bg-muted rounded-xl px-3 py-2 outline-none focus:ring-2 ring-ring/30 placeholder:text-muted-foreground"
              />
              <Button
                size="sm"
                className="rounded-xl"
                onClick={handleCreateToken}
                disabled={!newTokenName.trim() || tokenLoading}
              >
                <Plus className="size-4" />
                Generate
              </Button>
            </div>

            {/* Token list */}
            {tokens.length > 0 && (
              <div className="border border-border/50 rounded-xl divide-y divide-border/50 overflow-hidden">
                {tokens.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                    <KeyRound className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.lastUsedAt
                          ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                          : `Created ${new Date(t.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-lg shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteToken(t.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Connection instructions */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Add to your MCP client config:</p>
              <pre className="text-xs bg-muted rounded-xl p-3 overflow-x-auto leading-relaxed">{`{
  "mcpServers": {
    "feedwise": {
      "url": "${typeof window !== "undefined" ? window.location.origin : "https://your-app.com"}/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}`}</pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
