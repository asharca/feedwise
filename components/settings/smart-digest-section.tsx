"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "@/components/settings/setting-row";
import { Segmented } from "@/components/ui/segmented";

interface Props {
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmFormat: "openai" | "anthropic";
  llmKeyMask: string;
  llmSaving: boolean;
  llmTesting: boolean;
  onLlmEnabledChange: (enabled: boolean) => void;
  onLlmBaseUrlChange: (value: string) => void;
  onLlmApiKeyChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onLlmFormatChange: (value: "openai" | "anthropic") => void;
  onSave: () => void;
  onTest: () => void;
}

export function SmartDigestSection({
  llmEnabled,
  llmBaseUrl,
  llmApiKey,
  llmModel,
  llmFormat,
  llmKeyMask,
  llmSaving,
  llmTesting,
  onLlmEnabledChange,
  onLlmBaseUrlChange,
  onLlmApiKeyChange,
  onLlmModelChange,
  onLlmFormatChange,
  onSave,
  onTest,
}: Props) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Smart Digest (Beta)</CardTitle>
        <CardDescription>
          When on, your digest is grouped by topic and ranked by importance. Uses your own API. Off by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border">
          <SettingRow
            title="Enable LLM clustering"
            description="Group and rank articles before sending"
            control={<Switch checked={llmEnabled} onCheckedChange={onLlmEnabledChange} />}
          />
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">API Format</span>
            <Segmented
              options={[
                { value: "openai", label: "OpenAI" },
                { value: "anthropic", label: "Anthropic" },
              ]}
              value={llmFormat}
              onChange={onLlmFormatChange}
              aria-label="API format"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">API Base URL</span>
            <input
              type="url"
              value={llmBaseUrl}
              onChange={(e) => onLlmBaseUrlChange(e.target.value)}
              placeholder={llmFormat === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"}
              className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">
              API Key {llmKeyMask && <span>· stored: {llmKeyMask}</span>}
            </span>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => onLlmApiKeyChange(e.target.value)}
              placeholder={llmKeyMask ? "(unchanged — leave blank to keep)" : llmFormat === "anthropic" ? "sk-ant-..." : "sk-..."}
              className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Model</span>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => onLlmModelChange(e.target.value)}
              placeholder={llmFormat === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini"}
              className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="rounded-md" onClick={onSave} disabled={llmSaving}>
            {llmSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-md"
            onClick={onTest}
            disabled={llmTesting || !llmBaseUrl || !llmModel}
          >
            {llmTesting ? "Testing…" : "Test"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
