"use client";

import { useState } from "react";
import { Mail, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "@/components/settings/setting-row";
import { SettingsSubTabs, type SettingsSubTab } from "@/components/settings/settings-sub-tabs";
import { cn } from "@/lib/utils";
import CronBuilder from "@/components/cron-builder";

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

interface Props {
  loading: boolean;
  emailSettings: EmailSettings | null;
  emailSaving: boolean;
  emailTesting: boolean;
  emailError: string | null;
  smtpPassDraft: string;
  pendingCron: string | null;
  subs: Sub[];
  isSmtpValid: boolean;
  onEmailToggle: (enabled: boolean) => void;
  onCronChange: (cron: string) => void;
  onCronSave: () => void;
  onCronCancel: () => void;
  onSMTPChange: (field: string, value: string | number) => void;
  onSmtpPassDraftChange: (value: string) => void;
  onEmailSettingsChange: (updater: (prev: EmailSettings | null) => EmailSettings | null) => void;
  onFeedToggle: (feedId: string) => void;
  onTestEmail: () => void;
  onAutoSaveToggle: (autoSaveOnClick: boolean) => void;
}

export function DigestEmailSection({
  loading,
  emailSettings,
  emailSaving,
  emailTesting,
  emailError,
  smtpPassDraft,
  pendingCron,
  subs,
  isSmtpValid,
  onEmailToggle,
  onCronChange,
  onCronSave,
  onCronCancel,
  onSMTPChange,
  onSmtpPassDraftChange,
  onEmailSettingsChange,
  onFeedToggle,
  onTestEmail,
  onAutoSaveToggle,
}: Props) {
  const [tab, setTab] = useState("general");
  const enabled = emailSettings?.enabled ?? false;
  const subTabs: SettingsSubTab[] = [
    { key: "general", label: "General" },
    { key: "schedule", label: "Schedule" },
    { key: "smtp", label: "SMTP" },
    { key: "feeds", label: "Feeds" },
  ];

  return (
    <Card className="rounded-lg">
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
            {enabled && (
              <SettingsSubTabs tabs={subTabs} active={tab} onChange={setTab} />
            )}

            {/* General */}
            {(tab === "general" || !enabled) && (
              <div className="divide-y divide-border">
                <SettingRow
                  title="Enable email digest"
                  description="Receive a daily article summary"
                  control={
                    <Switch
                      checked={enabled}
                      onCheckedChange={onEmailToggle}
                      disabled={emailSaving || emailTesting}
                    />
                  }
                />
                {enabled && (
                  <SettingRow
                    title="Auto-save on click"
                    description="Save to starred when opened from email"
                    control={
                      <Switch
                        checked={emailSettings?.autoSaveOnClick ?? false}
                        onCheckedChange={onAutoSaveToggle}
                        disabled={emailSaving}
                      />
                    }
                  />
                )}
              </div>
            )}

            {/* Schedule */}
            {enabled && tab === "schedule" && (
              <div className="pt-1">
                <CronBuilder
                  value={pendingCron ?? emailSettings!.cronExpression}
                  onChange={onCronChange}
                  disabled={emailSaving || emailTesting}
                />
                {pendingCron !== null && pendingCron !== emailSettings!.cronExpression && (
                  <div className="flex items-center gap-2 mt-3">
                    <Button size="sm" className="rounded-md" disabled={emailSaving} onClick={onCronSave}>
                      {emailSaving ? "Saving…" : "Save schedule"}
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={onCronCancel}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SMTP */}
            {enabled && tab === "smtp" && (
              <div className="space-y-3 pt-1">
                {emailError && (
                  <div className="p-2 bg-destructive/10 text-destructive text-sm rounded-md">
                    {emailError}
                  </div>
                )}
                <div>
                  <label htmlFor="smtp-host" className="text-xs text-muted-foreground block mb-1">SMTP Host</label>
                  <input
                    id="smtp-host"
                    type="text"
                    placeholder="smtp.gmail.com"
                    value={emailSettings!.smtpHost || ""}
                    onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpHost: e.target.value } : null)}
                    onBlur={(e) => onSMTPChange("smtpHost", e.target.value)}
                    disabled={emailSaving || emailTesting}
                    className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="smtp-port" className="text-xs text-muted-foreground block mb-1">Port</label>
                    <input
                      id="smtp-port"
                      type="number"
                      placeholder="587"
                      value={emailSettings!.smtpPort || ""}
                      onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpPort: parseInt(e.target.value) || 587 } : null)}
                      onBlur={(e) => onSMTPChange("smtpPort", parseInt(e.target.value) || 587)}
                      disabled={emailSaving || emailTesting}
                      className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="smtp-from" className="text-xs text-muted-foreground block mb-1">From Name</label>
                    <input
                      id="smtp-from"
                      type="text"
                      placeholder="Feedwise"
                      value={emailSettings!.smtpFrom || ""}
                      onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpFrom: e.target.value } : null)}
                      onBlur={(e) => onSMTPChange("smtpFrom", e.target.value)}
                      disabled={emailSaving || emailTesting}
                      className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="smtp-user" className="text-xs text-muted-foreground block mb-1">Username / Email</label>
                  <input
                    id="smtp-user"
                    type="text"
                    placeholder="your-email@gmail.com"
                    value={emailSettings!.smtpUser || ""}
                    onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpUser: e.target.value } : null)}
                    onBlur={(e) => onSMTPChange("smtpUser", e.target.value)}
                    disabled={emailSaving || emailTesting}
                    className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="smtp-pass" className="text-xs text-muted-foreground block mb-1">Password / App Password</label>
                  <input
                    id="smtp-pass"
                    type="password"
                    placeholder="Enter password"
                    value={smtpPassDraft}
                    onChange={(e) => onSmtpPassDraftChange(e.target.value)}
                    onBlur={(e) => { if (e.target.value) onSMTPChange("smtpPass", e.target.value); }}
                    disabled={emailSaving || emailTesting}
                    className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
                  />
                  {emailSettings!.hasSmtpPass && (
                    <p className="mt-1 text-[11px] text-muted-foreground">SMTP password is saved.</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-md"
                  onClick={onTestEmail}
                  disabled={
                    emailSaving || emailTesting || !isSmtpValid ||
                    (!emailSettings!.hasSmtpPass && smtpPassDraft.trim().length === 0)
                  }
                >
                  <Mail className="size-4 mr-2" />
                  {emailTesting ? "Sending…" : "Send Test Email"}
                </Button>
              </div>
            )}

            {/* Feeds */}
            {enabled && tab === "feeds" && (
              subs.length > 0 ? (
                <div className="pt-1">
                  <div className="border border-border rounded-md divide-y divide-border max-h-80 overflow-y-auto scrollbar-thin">
                    {subs.map((sub) => {
                      const checked = (emailSettings!.selectedFeeds || []).includes(sub.feedId);
                      return (
                        <button
                          type="button"
                          key={sub.id}
                          onClick={() => onFeedToggle(sub.feedId)}
                          disabled={emailSaving || emailTesting}
                          aria-checked={checked}
                          role="checkbox"
                          className="w-full text-left flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/30 disabled:opacity-60"
                        >
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                            checked ? "bg-primary border-primary" : "border-muted-foreground"
                          )}>
                            {checked && <Check className="size-3 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{sub.title ?? sub.feedTitle ?? sub.url}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {(emailSettings!.selectedFeeds || []).length === 0
                      ? "All feeds will be included"
                      : `${(emailSettings!.selectedFeeds || []).length} feed(s) selected`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pt-2">No feeds to choose from yet.</p>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
