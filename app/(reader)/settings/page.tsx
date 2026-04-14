"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft, Sun, Moon, Monitor, Upload, Download, Trash2, RefreshCw, Clock, Mail, BookOpen, Check, User, Calendar } from "lucide-react";
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

interface EmailSettings {
  enabled: boolean;
  sendTime: string;
  frequency: "daily" | "weekly";
  selectedTags: string[];
  selectedFeeds: string[];
  hasSmtpPass?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
}

interface TagItem {
  id: string;
  name: string;
  color: string | null;
}

interface UserAccount {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
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
  const [syncing, setSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const loadedOnceRef = useRef(false);

  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [smtpPassDraft, setSmtpPassDraft] = useState("");
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;

    Promise.all([
      fetch("/api/feeds").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/settings/email").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/settings/account").then((r) => r.json()).catch(() => ({ success: false })),
    ]).then(([feedsData, emailData, accountData]) => {
      if (feedsData.success) setSubs(feedsData.data || []);
      if (emailData.success) setEmailSettings(emailData.data);
      if (accountData.success) setUserAccount(accountData.data);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load settings:", err);
      setError("Failed to load settings");
      setLoading(false);
    });
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

  function isSMTPConfigValid() {
    if (!emailSettings) return false;
    const { smtpHost, smtpPort, smtpUser } = emailSettings;
    if (!smtpHost || !smtpUser) return false;

    // Basic host validation
    const hostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$/;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!hostRegex.test(smtpHost) && !ipRegex.test(smtpHost)) return false;

    // Port validation
    if (smtpPort && (smtpPort < 1 || smtpPort > 65535)) return false;

    return true;
  }

  async function handleEmailToggle(enabled: boolean) {
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEmailSettings(data.data);
      }
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleEmailTimeChange(sendTime: string) {
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendTime }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEmailSettings(data.data);
      }
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleFrequencyChange(frequency: "daily" | "weekly") {
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEmailSettings(data.data);
      }
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleTagToggle(tagId: string) {
    if (!emailSettings) return;
    const selectedTags = (emailSettings.selectedTags || []).includes(tagId)
      ? emailSettings.selectedTags.filter((id) => id !== tagId)
      : [...(emailSettings.selectedTags || []), tagId];

    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTags }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEmailSettings(data.data);
      }
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleFeedToggle(feedId: string) {
    if (!emailSettings) return;

    const currentSelectedFeeds = emailSettings.selectedFeeds || [];
    const isSelected = currentSelectedFeeds.includes(feedId);
    const newSelectedFeeds = isSelected
      ? currentSelectedFeeds.filter((id) => id !== feedId)
      : [...currentSelectedFeeds, feedId];

    // Store the original state for potential rollback
    const originalSelectedFeeds = [...currentSelectedFeeds];

    // Optimistically update UI
    setEmailSettings(prev => {
      if (!prev) return prev; // Don't update if prev is null
      return { ...prev, selectedFeeds: newSelectedFeeds };
    });

    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedFeeds: newSelectedFeeds }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEmailSettings(data.data);
      } else {
        // Revert on error
        setEmailSettings(prev => {
          if (!prev) return prev;
          return { ...prev, selectedFeeds: originalSelectedFeeds };
        });
        setEmailError(data.error || "Failed to update");
      }
    } catch (err) {
      // Revert on error
      setEmailSettings(prev => {
        if (!prev) return prev;
        return { ...prev, selectedFeeds: originalSelectedFeeds };
      });
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleSMTPChange(field: string, value: string | number) {
    setEmailError(null);

    // Basic validation
    if (field === "smtpHost" && value && typeof value === "string") {
      // Check if it's a valid hostname/IP
      const hostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$/;
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!hostRegex.test(value) && !ipRegex.test(value)) {
        setEmailError("Invalid SMTP host format");
        return;
      }
    }

    if (field === "smtpPort" && value) {
      const port = typeof value === "string" ? parseInt(value) : value;
      if (port < 1 || port > 65535) {
        setEmailError("Invalid SMTP port (must be 1-65535)");
        return;
      }
    }

    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEmailSettings(data.data);
        if (field === "smtpPass") {
          setSmtpPassDraft("");
        }
      } else {
        setEmailError(data.error || "Failed to save");
      }
    } catch (err) {
      setEmailError("Failed to save");
    } finally {
      setEmailSaving(false);
    }
  }

  if (error) {
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
          <Card className="rounded-2xl border-border/50">
            <CardContent className="p-6">
              <div className="text-center text-destructive">
                <p className="text-sm font-medium">Failed to load settings</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
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

        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Feed Management</CardTitle>
            <CardDescription>Manage your RSS subscriptions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            {subs.length > 0 && (
              <div className="border border-border/50 rounded-xl divide-y divide-border/50 overflow-hidden">
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

        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4" />
              Daily Digest
            </CardTitle>
            <CardDescription>Get your articles delivered to your inbox</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                <div className="h-6 bg-muted rounded animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
                <div className="h-32 bg-muted rounded animate-pulse" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable email digest</p>
                    <p className="text-xs text-muted-foreground">Receive daily article summary</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEmailToggle(!(emailSettings?.enabled ?? false))}
                    disabled={emailSaving || emailTesting}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors relative",
                      (emailSettings?.enabled ?? false) ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                        (emailSettings?.enabled ?? false) ? "left-6" : "left-1"
                      )}
                    />
                  </button>
                </div>

                {emailSettings && emailSettings.enabled && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Send time</p>
                        <p className="text-xs text-muted-foreground">When to send the digest</p>
                      </div>
                      <select
                        value={emailSettings.sendTime}
                        onChange={(e) => handleEmailTimeChange(e.target.value)}
                        disabled={emailSaving || emailTesting}
                        className="text-sm bg-muted rounded-lg px-2 py-1 outline-none cursor-pointer"
                      >
                        <option value="06:00">6:00 AM</option>
                        <option value="07:00">7:00 AM</option>
                        <option value="08:00">8:00 AM</option>
                        <option value="09:00">9:00 AM</option>
                        <option value="10:00">10:00 AM</option>
                        <option value="12:00">12:00 PM</option>
                        <option value="18:00">6:00 PM</option>
                        <option value="20:00">8:00 PM</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Frequency</p>
                        <p className="text-xs text-muted-foreground">How often to send</p>
                      </div>
                      <select
                        value={emailSettings.frequency}
                        onChange={(e) => handleFrequencyChange(e.target.value as "daily" | "weekly")}
                        disabled={emailSaving || emailTesting}
                        className="text-sm bg-muted rounded-lg px-2 py-1 outline-none cursor-pointer"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>

                    <div className="border-t border-border/30 pt-4 mt-4">
                      <p className="text-sm font-medium mb-3">SMTP Configuration</p>
                      {emailError && (
                        <div className="mb-3 p-2 bg-destructive/10 text-destructive text-sm rounded-lg">
                          {emailError}
                        </div>
                      )}
                      <div className="grid gap-3">
                        <div>
                          <label htmlFor="smtp-host" className="text-xs text-muted-foreground block mb-1">SMTP Host</label>
                          <input
                            id="smtp-host"
                            type="text"
                            placeholder="smtp.gmail.com"
                            value={emailSettings.smtpHost || ""}
                            onChange={(e) => setEmailSettings(prev => prev ? { ...prev, smtpHost: e.target.value } : null)}
                            onBlur={(e) => handleSMTPChange("smtpHost", e.target.value)}
                            disabled={emailSaving || emailTesting}
                            className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="smtp-port" className="text-xs text-muted-foreground block mb-1">Port</label>
                            <input
                              id="smtp-port"
                              type="number"
                              placeholder="587"
                              value={emailSettings.smtpPort || ""}
                              onChange={(e) => setEmailSettings(prev => prev ? { ...prev, smtpPort: parseInt(e.target.value) || 587 } : null)}
                              onBlur={(e) => handleSMTPChange("smtpPort", parseInt(e.target.value) || 587)}
                              disabled={emailSaving || emailTesting}
                              className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                            />
                          </div>
                          <div>
                            <label htmlFor="smtp-from" className="text-xs text-muted-foreground block mb-1">From Name</label>
                            <input
                              id="smtp-from"
                              type="text"
                              placeholder="Feedwise"
                              value={emailSettings.smtpFrom || ""}
                              onChange={(e) => setEmailSettings(prev => prev ? { ...prev, smtpFrom: e.target.value } : null)}
                              onBlur={(e) => handleSMTPChange("smtpFrom", e.target.value)}
                              disabled={emailSaving || emailTesting}
                              className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="smtp-user" className="text-xs text-muted-foreground block mb-1">Username / Email</label>
                          <input
                            id="smtp-user"
                            type="text"
                            placeholder="your-email@gmail.com"
                            value={emailSettings.smtpUser || ""}
                            onChange={(e) => setEmailSettings(prev => prev ? { ...prev, smtpUser: e.target.value } : null)}
                            onBlur={(e) => handleSMTPChange("smtpUser", e.target.value)}
                            disabled={emailSaving || emailTesting}
                            className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="smtp-pass" className="text-xs text-muted-foreground block mb-1">Password / App Password</label>
                          <input
                            id="smtp-pass"
                            type="password"
                            placeholder="Enter password"
                            value={smtpPassDraft}
                            onChange={(e) => setSmtpPassDraft(e.target.value)}
                            onBlur={(e) => {
                              if (e.target.value) handleSMTPChange("smtpPass", e.target.value);
                            }}
                            disabled={emailSaving || emailTesting}
                            className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                          />
                          {emailSettings?.hasSmtpPass && (
                            <p className="mt-1 text-[11px] text-muted-foreground">SMTP password is saved.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {subs.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-1">
                          <BookOpen className="size-4" />
                          Select feeds to notify
                        </p>
                        <div className="border border-border/50 rounded-lg divide-y divide-border/50 max-h-48 overflow-y-auto">
                          {subs.map((sub) => (
                            <button
                              type="button"
                              key={sub.id}
                              onClick={() => handleFeedToggle(sub.feedId)}
                              disabled={emailSaving || emailTesting}
                              aria-checked={(emailSettings.selectedFeeds || []).includes(sub.feedId)}
                              role="checkbox"
                              className="w-full text-left flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/30 disabled:opacity-60"
                            >
                              <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                (emailSettings.selectedFeeds || []).includes(sub.feedId)
                                  ? "bg-primary border-primary"
                                  : "border-muted-foreground"
                              )}>
                                {(emailSettings.selectedFeeds || []).includes(sub.feedId) && (
                                  <Check className="size-3 text-primary-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate">{sub.title ?? sub.feedTitle ?? sub.url}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {(emailSettings.selectedFeeds || []).length === 0
                            ? "All feeds will be included"
                            : `${(emailSettings.selectedFeeds || []).length} feed(s) selected`}
                        </p>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl"
                      onClick={async () => {
                        setEmailTesting(true);
                        setEmailError(null);
                        try {
                          const res = await fetch("/api/settings/email/test", { method: "POST" });
                          const data = await res.json();
                          if (data.success) {
                            // Success - maybe show a success message
                            console.log("Test email sent successfully:", data.data);
                          } else {
                            setEmailError(data.error || "Failed to send test email");
                          }
                        } catch (err) {
                          setEmailError("Failed to send test email");
                          console.error("Test email error:", err);
                        } finally {
                          setEmailTesting(false);
                        }
                      }}
                      disabled={
                        emailSaving ||
                        emailTesting ||
                        !isSMTPConfigValid() ||
                        (!(emailSettings?.hasSmtpPass) && smtpPassDraft.trim().length === 0)
                      }
                    >
                      <Mail className="size-4 mr-2" />
                      {emailTesting ? "Sending..." : "Send Test Email"}
                    </Button>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent>
            {userAccount ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {userAccount.image ? (
                    <img src={userAccount.image} alt="" className="w-12 h-12 rounded-full" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <User className="size-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{userAccount.name || "Unnamed User"}</p>
                    <p className="text-xs text-muted-foreground">{userAccount.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="size-3" />
                  <span>Joined {new Date(userAccount.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="pt-2 border-t border-border/30">
                  <label htmlFor="user-name" className="text-xs text-muted-foreground block mb-1">Display Name</label>
                  <div className="flex gap-2">
                    <input
                      id="user-name"
                      type="text"
                      placeholder="Enter your name"
                      value={userAccount.name || ""}
                      onChange={(e) => setUserAccount(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="flex-1 text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                    />
                    <Button
                      size="sm"
                      className="rounded-xl"
                      onClick={async () => {
                        await fetch("/api/settings/account", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: userAccount.name }),
                        });
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
                <div className="pt-2 border-t border-border/30">
                  <label htmlFor="user-email" className="text-xs text-muted-foreground block mb-1">Email</label>
                  <div className="flex gap-2">
                    <input
                      id="user-email"
                      type="email"
                      placeholder="Enter your email"
                      value={userAccount.email || ""}
                      onChange={(e) => setUserAccount(prev => prev ? { ...prev, email: e.target.value } : null)}
                      className="flex-1 text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                    />
                    <Button
                      size="sm"
                      className="rounded-xl"
                      onClick={async () => {
                        const res = await fetch("/api/settings/account", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: userAccount.email }),
                        });
                        const data = await res.json();
                        if (!data.success) {
                          alert(data.error || "Failed to update email");
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
