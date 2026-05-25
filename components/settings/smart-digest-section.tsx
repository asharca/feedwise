"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmKeyMask: string;
  llmSaving: boolean;
  llmTesting: boolean;
  onLlmEnabledChange: (enabled: boolean) => void;
  onLlmBaseUrlChange: (value: string) => void;
  onLlmApiKeyChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onSave: () => void;
  onTest: () => void;
}

export function SmartDigestSection({
  llmEnabled,
  llmBaseUrl,
  llmApiKey,
  llmModel,
  llmKeyMask,
  llmSaving,
  llmTesting,
  onLlmEnabledChange,
  onLlmBaseUrlChange,
  onLlmApiKeyChange,
  onLlmModelChange,
  onSave,
  onTest,
}: Props) {
  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Smart Digest (Beta)</CardTitle>
        <CardDescription>
          When on, your digest is grouped by topic and ranked by importance. Uses your own OpenAI-compatible API. Off by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={llmEnabled}
            onChange={(e) => onLlmEnabledChange(e.target.checked)}
          />
          <span>Enable LLM clustering</span>
        </label>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">API Base URL</span>
            <input
              type="url"
              value={llmBaseUrl}
              onChange={(e) => onLlmBaseUrlChange(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
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
              placeholder={llmKeyMask ? "(unchanged — leave blank to keep)" : "sk-..."}
              className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Model</span>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => onLlmModelChange(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full text-sm bg-muted rounded-lg px-3 py-2 outline-none"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-xl"
            onClick={onSave}
            disabled={llmSaving}
          >
            {llmSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={onTest}
            disabled={llmTesting || !llmBaseUrl || !llmModel}
          >
            {llmTesting ? "Testing..." : "Test"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
