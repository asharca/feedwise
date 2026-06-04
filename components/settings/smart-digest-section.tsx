"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "@/components/settings/setting-row";
import { Segmented } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";

interface Props {
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmFormat: "openai" | "anthropic";
  llmKeyMask: string;
  llmAutoSummarize: boolean;
  llmAutoTag: boolean;
  llmSaving: boolean;
  llmTesting: boolean;
  onLlmEnabledChange: (enabled: boolean) => void;
  onLlmBaseUrlChange: (value: string) => void;
  onLlmApiKeyChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onLlmFormatChange: (value: "openai" | "anthropic") => void;
  onLlmAutoSummarizeChange: (value: boolean) => void;
  onLlmAutoTagChange: (value: boolean) => void;
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
  llmAutoSummarize,
  llmAutoTag,
  llmSaving,
  llmTesting,
  onLlmEnabledChange,
  onLlmBaseUrlChange,
  onLlmApiKeyChange,
  onLlmModelChange,
  onLlmFormatChange,
  onLlmAutoSummarizeChange,
  onLlmAutoTagChange,
  onSave,
  onTest,
}: Props) {
  const [models, setModels] = useState<Array<{ id: string; displayName: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Invalidate the loaded model list when the endpoint changes — it belongs
  // to whatever provider was just configured.
  useEffect(() => {
    setModels([]);
    setModelsLoaded(false);
  }, [llmBaseUrl, llmFormat]);

  async function handleLoadModels() {
    if (!llmBaseUrl) {
      toast.error("Set API Base URL first");
      return;
    }
    setModelsLoading(true);
    try {
      const res = await fetch("/api/email/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: llmBaseUrl,
          apiKey: llmApiKey || undefined,
          format: llmFormat,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        models?: Array<{ id: string; displayName: string }>;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(`Could not load models: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }
      const list = data.models ?? [];
      setModels(list);
      setModelsLoaded(true);
      if (list.length === 0) {
        toast.warning("Server returned no models");
      } else {
        toast.success(`Loaded ${list.length} model${list.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setModelsLoading(false);
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Smart Digest (Beta)</CardTitle>
        <CardDescription>
          When on, your digest is grouped by topic and ranked by importance. Uses your own API. Off
          by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border">
          <SettingRow
            title="Enable LLM clustering"
            description="Group and rank articles before sending"
            control={<Switch checked={llmEnabled} onCheckedChange={onLlmEnabledChange} />}
          />
          <SettingRow
            title="Auto-summarise articles on open"
            description="Run AI summary the moment an article is opened. Turn off to require manual ✨ click."
            control={
              <Switch
                checked={llmAutoSummarize}
                onCheckedChange={onLlmAutoSummarizeChange}
                disabled={!llmEnabled}
              />
            }
          />
          <SettingRow
            title="Auto-tag articles in the background"
            description="A background worker tags your recent untagged articles (up to 20 per user every 5 min). You can still tag or untag manually."
            control={
              <Switch
                checked={llmAutoTag}
                onCheckedChange={onLlmAutoTagChange}
                disabled={!llmEnabled}
              />
            }
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
              placeholder={
                llmFormat === "anthropic"
                  ? "https://api.anthropic.com/v1"
                  : "https://api.openai.com/v1"
              }
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
              placeholder={
                llmKeyMask
                  ? "(unchanged — leave blank to keep)"
                  : llmFormat === "anthropic"
                    ? "sk-ant-..."
                    : "sk-..."
              }
              className="w-full text-sm bg-muted rounded-md px-3 py-2 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Model</span>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={llmModel}
                onChange={(e) => onLlmModelChange(e.target.value)}
                placeholder={
                  llmFormat === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini"
                }
                list={modelsLoaded ? "llm-models-datalist" : undefined}
                className="flex-1 text-sm bg-muted rounded-md px-3 py-2 outline-none"
              />
              {modelsLoaded ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<button type="button" />}
                    className="inline-flex items-center gap-1 text-xs px-2.5 rounded-md bg-muted hover:bg-accent transition-colors shrink-0"
                  >
                    Pick
                    <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-md max-h-72 overflow-y-auto">
                    {models.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No models</div>
                    )}
                    {models.map((m) => (
                      <DropdownMenuItem key={m.id} onClick={() => onLlmModelChange(m.id)}>
                        <span className="font-mono text-xs">{m.id}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-md shrink-0"
                  onClick={handleLoadModels}
                  disabled={modelsLoading || !llmBaseUrl}
                  title="Query /v1/models from the configured endpoint"
                >
                  {modelsLoading ? "Loading…" : "Load models"}
                </Button>
              )}
            </div>
            {modelsLoaded && (
              <datalist id="llm-models-datalist">
                {models.map((m) => (
                  <option key={m.id} value={m.id} />
                ))}
              </datalist>
            )}
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
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
            {llmTesting ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
