"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { FeedsSection } from "@/components/settings/feeds-section";
import { DigestEmailSection } from "@/components/settings/digest-email-section";
import { DigestHistorySection } from "@/components/settings/digest-history-section";
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

type SettingsSource = "feeds" | "email" | "account" | "llm";
type SourceStatus = "loading" | "ready" | "error";

interface SourceState {
  status: SourceStatus;
  error: string | null;
}

const INITIAL_SOURCE_STATE: Record<SettingsSource, SourceState> = {
  feeds: { status: "loading", error: null },
  email: { status: "loading", error: null },
  account: { status: "loading", error: null },
  llm: { status: "loading", error: null },
};

const SOURCE_LABELS: Record<SettingsSource, string> = {
  feeds: "subscriptions",
  email: "email digest settings",
  account: "account details",
  llm: "Smart Digest settings",
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(`Request failed (${response.status})`);
  return data as T;
}

export const SETTINGS_SECTIONS = [
  { key: "appearance", label: "Appearance" },
  { key: "feeds", label: "Feeds" },
  { key: "digest", label: "Digest Email" },
  { key: "smart", label: "Smart Digest" },
  { key: "account", label: "Account" },
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

interface SettingsContentProps {
  initialSection?: SettingsSectionKey;
  /** Optional dense layout for use inside a dialog (drops outer padding). */
  variant?: "page" | "dialog";
  onSectionChange?: (section: SettingsSectionKey) => void;
}

export function SettingsContent({
  initialSection = "appearance",
  variant = "page",
  onSectionChange,
}: SettingsContentProps) {
  const { theme, setTheme } = useTheme();
  const [active, setActive] = useState<SettingsSectionKey>(initialSection);
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
  const [llmFormat, setLlmFormat] = useState<"openai" | "anthropic">("openai");
  const [llmKeyMask, setLlmKeyMask] = useState("");
  const [llmAutoSummarize, setLlmAutoSummarize] = useState(true);
  const [llmAutoTag, setLlmAutoTag] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [sourceState, setSourceState] =
    useState<Record<SettingsSource, SourceState>>(INITIAL_SOURCE_STATE);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActive(initialSection);
  }, [initialSection]);

  function selectSection(section: SettingsSectionKey) {
    setActive(section);
    onSectionChange?.(section);
  }

  const loadSource = useCallback(async (source: SettingsSource) => {
    setSourceState((current) => ({
      ...current,
      [source]: { status: "loading", error: null },
    }));

    try {
      switch (source) {
        case "feeds": {
          const data = await requestJson<{ success: boolean; data?: Sub[]; error?: string }>(
            "/api/feeds",
          );
          if (!data.success) throw new Error(data.error ?? "The server rejected the request");
          setSubs(data.data ?? []);
          break;
        }
        case "email": {
          const data = await requestJson<{
            success: boolean;
            data?: EmailSettings | null;
            error?: string;
          }>("/api/settings/email");
          if (!data.success || !data.data) {
            throw new Error(data.error ?? "No email settings were returned");
          }
          setEmailSettings(data.data);
          break;
        }
        case "account": {
          const data = await requestJson<{
            success: boolean;
            data?: UserAccount | null;
            error?: string;
          }>("/api/settings/account");
          if (!data.success || !data.data) {
            throw new Error(data.error ?? "No account details were returned");
          }
          setUserAccount(data.data);
          break;
        }
        case "llm": {
          const data = await requestJson<{
            enabled?: boolean;
            baseUrl?: string;
            model?: string;
            format?: "openai" | "anthropic";
            apiKeyMask?: string;
            autoSummarize?: boolean;
            autoTag?: boolean;
          }>("/api/email/llm/config");
          setLlmEnabled(!!data.enabled);
          setLlmBaseUrl(data.baseUrl ?? "");
          setLlmModel(data.model ?? "");
          setLlmFormat(data.format ?? "openai");
          setLlmKeyMask(data.apiKeyMask ?? "");
          setLlmAutoSummarize(data.autoSummarize ?? true);
          setLlmAutoTag(data.autoTag ?? false);
          break;
        }
      }

      setSourceState((current) => ({
        ...current,
        [source]: { status: "ready", error: null },
      }));
    } catch (error) {
      setSourceState((current) => ({
        ...current,
        [source]: {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }));
    }
  }, []);

  useEffect(() => {
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;

    void Promise.allSettled(
      (["feeds", "email", "account", "llm"] as const).map((source) => loadSource(source)),
    );
  }, [loadSource]);

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
          format: llmFormat,
          autoSummarize: llmAutoSummarize,
          autoTag: llmAutoTag,
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
          format: llmFormat,
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
    try {
      const res = await fetch("/api/opml/export");
      if (!res.ok) throw new Error("Could not export subscriptions");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "feedwise-subscriptions.opml";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export subscriptions");
    }
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
      const importResponse = await fetch("/api/opml/import", { method: "POST", body: formData });
      if (!importResponse.ok) {
        toast.error("Could not import subscriptions");
        return;
      }
      const data = await fetch("/api/feeds").then((r) => r.json());
      if (data.success) {
        setSubs(data.data);
        toast.success("Subscriptions imported");
      }
    };
    input.click();
  }

  async function handleSyncAll() {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/feeds/sync", { method: "POST" });
      if (!response.ok) throw new Error("Could not start feed sync");
      toast.success("Feed sync started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start feed sync");
    } finally {
      setSyncing(false);
    }
  }

  async function handleIntervalChange(sub: Sub, minutes: number) {
    const response = await fetch(`/api/feeds/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fetchIntervalMinutes: minutes }),
    });
    if (!response.ok) {
      toast.error("Could not update refresh interval");
      return;
    }
    setSubs((prev) =>
      prev.map((s) => (s.id === sub.id ? { ...s, fetchIntervalMinutes: minutes } : s)),
    );
  }

  async function handleDeleteFeed(sub: Sub) {
    const confirmed = window.confirm(
      `Unsubscribe from "${sub.title ?? sub.feedTitle ?? sub.url}"?`,
    );
    if (!confirmed) return;
    const response = await fetch(`/api/feeds/${sub.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Could not unsubscribe from this feed");
      return;
    }
    setSubs((prev) => prev.filter((s) => s.id !== sub.id));
    toast.success("Feed removed");
  }

  function isSMTPConfigValid() {
    if (!emailSettings) return false;
    const { smtpHost, smtpPort, smtpUser } = emailSettings;
    if (!smtpHost || !smtpUser) return false;

    const hostRegex =
      /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
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
      if (data.success && data.data) setEmailSettings(data.data);
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

  async function handleMarkReadOnClickToggle(markReadOnClick: boolean) {
    setEmailSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markReadOnClick }),
      });
      const data = await res.json();
      if (data.success && data.data) setEmailSettings(data.data);
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

    setEmailSettings((prev) => {
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
        setEmailSettings((prev) => {
          if (!prev) return prev;
          return { ...prev, selectedFeeds: originalSelectedFeeds };
        });
        setEmailError(data.error || "Failed to update");
      }
    } catch {
      setEmailSettings((prev) => {
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
      const hostRegex =
        /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
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
        if (field === "smtpPass") setSmtpPassDraft("");
      } else {
        setEmailError(data.error || "Failed to save");
      }
    } catch {
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
        toast.success("Test email sent");
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
    try {
      const res = await fetch("/api/settings/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userAccount?.name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Could not update name");
      toast.success("Name updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update name");
    }
  }

  async function handleEmailSave() {
    try {
      const res = await fetch("/api/settings/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userAccount?.email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error ?? "Could not update email");
      toast.success("Email updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update email");
    }
  }

  function renderSourceState(source: SettingsSource) {
    const state = sourceState[source];
    if (state.status === "ready") return null;

    const loading = state.status === "loading";
    return (
      <div
        role={loading ? "status" : "alert"}
        aria-live="polite"
        className={cn(
          "flex min-h-24 items-start gap-3 rounded-md border px-4 py-3",
          loading ? "border-border bg-muted/40" : "border-destructive/30 bg-destructive/5",
        )}
      >
        {loading ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {loading
              ? `Loading ${SOURCE_LABELS[source]}...`
              : `Could not load ${SOURCE_LABELS[source]}`}
          </p>
          {!loading && (
            <p className="mt-1 text-xs text-muted-foreground">
              {state.error}. Other settings remain available.
            </p>
          )}
        </div>
        {!loading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 shrink-0 rounded-md"
            onClick={() => void loadSource(source)}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  function renderActiveSection() {
    switch (active) {
      case "appearance":
        return <AppearanceSection theme={theme} mounted={mounted} onSelect={setTheme} />;
      case "feeds":
        if (sourceState.feeds.status !== "ready") return renderSourceState("feeds");
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
          <div className="space-y-4">
            {sourceState.feeds.status !== "ready" && renderSourceState("feeds")}
            {sourceState.email.status === "error" ? (
              renderSourceState("email")
            ) : (
              <DigestEmailSection
                loading={sourceState.email.status === "loading"}
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
                onMarkReadOnClickToggle={handleMarkReadOnClickToggle}
              />
            )}
            <DigestHistorySection />
          </div>
        );
      case "smart":
        if (sourceState.llm.status !== "ready") return renderSourceState("llm");
        return (
          <SmartDigestSection
            llmEnabled={llmEnabled}
            llmBaseUrl={llmBaseUrl}
            llmApiKey={llmApiKey}
            llmModel={llmModel}
            llmFormat={llmFormat}
            llmKeyMask={llmKeyMask}
            llmAutoSummarize={llmAutoSummarize}
            llmAutoTag={llmAutoTag}
            llmSaving={llmSaving}
            llmTesting={llmTesting}
            onLlmEnabledChange={setLlmEnabled}
            onLlmBaseUrlChange={setLlmBaseUrl}
            onLlmApiKeyChange={setLlmApiKey}
            onLlmModelChange={setLlmModel}
            onLlmFormatChange={setLlmFormat}
            onLlmAutoSummarizeChange={setLlmAutoSummarize}
            onLlmAutoTagChange={setLlmAutoTag}
            onSave={saveLlmConfig}
            onTest={testLlm}
          />
        );
      case "account":
        if (sourceState.account.status !== "ready") return renderSourceState("account");
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

  const gap = variant === "dialog" ? "gap-5" : "gap-6";
  const railWidth = variant === "dialog" ? "w-40" : "w-44";

  return (
    <>
      {/* Mobile section picker */}
      <div className="mb-4 md:hidden">
        <select
          aria-label="Settings section"
          value={active}
          onChange={(e) => selectSection(e.target.value as SettingsSectionKey)}
          className="h-11 w-full cursor-pointer rounded-md border border-input bg-muted px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {SETTINGS_SECTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className={cn("flex flex-col md:flex-row", gap)}>
        <nav
          aria-label="Settings sections"
          className={cn("hidden md:flex flex-col gap-1 shrink-0", railWidth)}
        >
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => selectSection(s.key)}
              aria-current={active === s.key ? "page" : undefined}
              className={cn(
                "text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active === s.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-section min-w-0 flex-1 [&_[data-slot=card]]:gap-5 [&_[data-slot=card]]:overflow-visible [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-content]]:px-0">
          {renderActiveSection()}
        </div>
      </div>
    </>
  );
}
