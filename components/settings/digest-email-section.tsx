"use client";

import { Mail, BookOpen, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  return (
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
                onClick={() => onEmailToggle(!(emailSettings?.enabled ?? false))}
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
                <div>
                  <div className="mb-2">
                    <p className="text-sm font-medium">推送计划</p>
                    <p className="text-xs text-muted-foreground">选择何时推送邮件摘要</p>
                  </div>
                  <CronBuilder
                    value={pendingCron ?? emailSettings.cronExpression}
                    onChange={onCronChange}
                    disabled={emailSaving || emailTesting}
                  />
                  {pendingCron !== null && pendingCron !== emailSettings.cronExpression && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="rounded-xl"
                        disabled={emailSaving}
                        onClick={onCronSave}
                      >
                        {emailSaving ? "保存中..." : "保存推送计划"}
                      </Button>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={onCronCancel}
                      >
                        取消
                      </button>
                    </div>
                  )}
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
                        onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpHost: e.target.value } : null)}
                        onBlur={(e) => onSMTPChange("smtpHost", e.target.value)}
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
                          onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpPort: parseInt(e.target.value) || 587 } : null)}
                          onBlur={(e) => onSMTPChange("smtpPort", parseInt(e.target.value) || 587)}
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
                          onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpFrom: e.target.value } : null)}
                          onBlur={(e) => onSMTPChange("smtpFrom", e.target.value)}
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
                        onChange={(e) => onEmailSettingsChange(prev => prev ? { ...prev, smtpUser: e.target.value } : null)}
                        onBlur={(e) => onSMTPChange("smtpUser", e.target.value)}
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
                        onChange={(e) => onSmtpPassDraftChange(e.target.value)}
                        onBlur={(e) => {
                          if (e.target.value) onSMTPChange("smtpPass", e.target.value);
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
                          onClick={() => onFeedToggle(sub.feedId)}
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

                <div className="flex items-center justify-between border-t border-border/30 pt-4 mt-4">
                  <div>
                    <p className="text-sm font-medium">点击文章时自动收藏</p>
                    <p className="text-xs text-muted-foreground">在邮件中点开文章后自动加入收藏夹</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAutoSaveToggle(!(emailSettings?.autoSaveOnClick ?? false))}
                    disabled={emailSaving}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors relative",
                      (emailSettings?.autoSaveOnClick ?? false) ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                        (emailSettings?.autoSaveOnClick ?? false) ? "left-6" : "left-1"
                      )}
                    />
                  </button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl"
                  onClick={onTestEmail}
                  disabled={
                    emailSaving ||
                    emailTesting ||
                    !isSmtpValid ||
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
  );
}
