"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { FeedsSection } from "@/components/settings/feeds-section";
import { DigestEmailSection } from "@/components/settings/digest-email-section";
import { SmartDigestSection } from "@/components/settings/smart-digest-section";
import { AccountSection } from "@/components/settings/account-section";

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
  cronExpression: string | null;
  selectedTags: string[];
  selectedFeeds: string[];
  hasSmtpPass?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  autoSaveOnClick?: boolean;
}

interface UserAccount {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
}

const SECTIONS = [
  { key: "appearance", label: "Appearance" },
  { key: "feeds", label: "Feeds" },
  { key: "digest", label: "Digest Email" },
  { key: "smart", label: "Smart Digest" },
  { key: "account", label: "Account" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [active, setActive] = useState<SectionKey>("appearance");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const loadedOnceRef = useRef(false);

  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [smtpPassDraft, setSmtpPassDraft] = useState("");
  const [pendingCron, setPendingCron] = useState<string | null>(null);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmKeyMask, setLlmKeyMask] = useState("");
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
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
      fetch("/api/email/llm/config").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([feedsData, emailData, accountData, llmData]) => {
      if (feedsData.success) setSubs(feedsData.data || []);
      if (emailData.success) setEmailSettings(emailData.data);
      if (accountData.success) setUserAccount(accountData.data);
      if (llmData) {
        setLlmEnabled(!!llmData.enabled);
        setLlmBaseUrl(llmData.baseUrl ?? "");
        setLlmModel(llmData.model ?? "");
        setLlmKeyMask(llmData.apiKeyMask ?? "");
      }
      setLoading(false);
    }).catch(() => {
      setError("Failed to load settings");
      setLoading(false);
    });
  }, []);

  async function saveLlmConfig() {
    setLlmSaving(true);
    try {
      const res = await fetch("/api/email/llm/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: llmEnabled,
          baseUrl: llmBaseUrl,
          apiKey: llmApiKey || undefined,
          model: llmModel,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to save LLM config");
      } else {
        toast.success("LLM config saved");
        if (llmApiKey) {
          const k = llmApiKey;
          setLlmKeyMask(k.length >= 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "•••");
          setLlmApiKey("");
        }
      }
    } finally {
      setLlmSaving(false);
    }
  }

  async function testLlm() {
    setLlmTesting(true);
    try {
      const res = await fetch("/api/email/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: llmBaseUrl,
          apiKey: llmApiKey || undefined,
          model: llmModel,
        }),
      });
      if (res.ok) {
        toast.success("LLM reachable");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(`Test failed (${res.status}): ${body.error ?? "unknown"}`);
      }
    } finally {
      setLlmTesting(false);
    }
  }

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

    const hostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$/;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!hostRegex.test(smtpHost) && !ipRegex.test(smtpHost)) return false;

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

  async function handleAutoSaveToggle(autoSaveOnClick: boolean) {
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSaveOnClick }),
      });
      const data = await res.json();
      if (data.success && data.data) setEmailSettings(data.data);
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

    const originalSelectedFeeds = [...currentSelectedFeeds];

    setEmailSettings(prev => {
      if (!prev) return prev;
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
        setEmailSettings(prev => {
          if (!prev) return prev;
          return { ...prev, selectedFeeds: originalSelectedFeeds };
        });
        setEmailError(data.error || "Failed to update");
      }
    } catch (err) {
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

    if (field === "smtpHost" && value && typeof value === "string") {
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

  async function handleCronSave() {
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronExpression: pendingCron }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEmailSettings(data.data);
        setPendingCron(null);
      }
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleTestEmail() {
    setEmailTesting(true);
    setEmailError(null);
    try {
      const res = await fetch("/api/settings/email/test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("测试邮件发送成功");
      } else {
        setEmailError(data.error || "Failed to send test email");
      }
    } catch {
      setEmailError("Failed to send test email");
    } finally {
      setEmailTesting(false);
    }
  }

  async function handleNameSave() {
    await fetch("/api/settings/account", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: userAccount?.name }),
    });
  }

  async function handleEmailSave() {
    const res = await fetch("/api/settings/account", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userAccount?.email }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || "Failed to update email");
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

  function renderActiveSection() {
    switch (active) {
      case "appearance":
        return (
          <AppearanceSection
            theme={theme}
            mounted={mounted}
            onSelect={setTheme}
          />
        );
      case "feeds":
        return (
          <FeedsSection
            subs={subs}
            syncing={syncing}
            onSyncAll={handleSyncAll}
            onImportOPML={handleImportOPML}
            onExportOPML={handleExportOPML}
            onIntervalChange={handleIntervalChange}
            onDeleteFeed={handleDeleteFeed}
          />
        );
      case "digest":
        return (
          <DigestEmailSection
            loading={loading}
            emailSettings={emailSettings}
            emailSaving={emailSaving}
            emailTesting={emailTesting}
            emailError={emailError}
            smtpPassDraft={smtpPassDraft}
            pendingCron={pendingCron}
            subs={subs}
            isSmtpValid={isSMTPConfigValid()}
            onEmailToggle={handleEmailToggle}
            onCronChange={setPendingCron}
            onCronSave={handleCronSave}
            onCronCancel={() => setPendingCron(null)}
            onSMTPChange={handleSMTPChange}
            onSmtpPassDraftChange={setSmtpPassDraft}
            onEmailSettingsChange={setEmailSettings}
            onFeedToggle={handleFeedToggle}
            onTestEmail={handleTestEmail}
            onAutoSaveToggle={handleAutoSaveToggle}
          />
        );
      case "smart":
        return (
          <SmartDigestSection
            llmEnabled={llmEnabled}
            llmBaseUrl={llmBaseUrl}
            llmApiKey={llmApiKey}
            llmModel={llmModel}
            llmKeyMask={llmKeyMask}
            llmSaving={llmSaving}
            llmTesting={llmTesting}
            onLlmEnabledChange={setLlmEnabled}
            onLlmBaseUrlChange={setLlmBaseUrl}
            onLlmApiKeyChange={setLlmApiKey}
            onLlmModelChange={setLlmModel}
            onSave={saveLlmConfig}
            onTest={testLlm}
          />
        );
      case "account":
        return (
          <AccountSection
            userAccount={userAccount}
            onAccountChange={setUserAccount}
            onNameSave={handleNameSave}
            onEmailSave={handleEmailSave}
          />
        );
    }
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto p-6 sm:p-8">
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

        {/* Mobile section picker */}
        <div className="md:hidden mb-4">
          <select
            value={active}
            onChange={(e) => setActive(e.target.value as SectionKey)}
            className="w-full text-sm bg-muted rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            {SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-6">
          {/* Desktop left rail */}
          <nav aria-label="Settings sections" className="hidden md:flex flex-col gap-1 w-44 shrink-0">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={active === s.key ? "page" : undefined}
                className={cn(
                  "text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                  active === s.key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* Section pane */}
          <div className="flex-1 min-w-0">
            {renderActiveSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
