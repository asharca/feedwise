import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscriptions } from "@/lib/db/schema";
import { encryptSecret, decryptIfEncrypted } from "@/lib/crypto/secrets";
import type { LlmFormat } from "@/lib/digest/llm-client";

export type { LlmFormat };

export interface LlmConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  format: LlmFormat;
  autoSummarize: boolean;
  autoTag: boolean;
}

export interface LlmConfigInput {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  format?: LlmFormat;
  autoSummarize?: boolean;
  autoTag?: boolean;
}

async function getSubscriptionRow(userId: string) {
  const [sub] = await db
    .select()
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.userId, userId));
  return sub ?? null;
}

export async function getUserLlmConfig(userId: string): Promise<LlmConfig | null> {
  const sub = await getSubscriptionRow(userId);
  if (!sub || !sub.llmEnabled || !sub.llmBaseUrl || !sub.llmApiKey || !sub.llmModel) {
    return null;
  }
  let apiKey = "";
  try {
    apiKey = decryptIfEncrypted(sub.llmApiKey) ?? "";
  } catch {
    // Decryption failed (key rotated or corrupted) — surface as no config
    return null;
  }
  return {
    enabled: true,
    baseUrl: sub.llmBaseUrl,
    apiKey,
    model: sub.llmModel,
    format: (sub.llmFormat as LlmFormat) ?? "openai",
    autoSummarize: sub.autoSummarize ?? true,
    autoTag: sub.autoTag ?? false,
  };
}

export async function updateUserLlmConfig(userId: string, input: LlmConfigInput): Promise<void> {
  const existing = await getSubscriptionRow(userId);
  const apiKeyToStore =
    input.apiKey === undefined
      ? (existing?.llmApiKey ?? null)
      : input.apiKey === ""
        ? null
        : encryptSecret(input.apiKey);

  if (!existing) {
    await db.insert(emailSubscriptions).values({
      userId,
      enabled: false,
      llmEnabled: input.enabled,
      llmBaseUrl: input.baseUrl || null,
      llmApiKey: apiKeyToStore,
      llmModel: input.model || null,
      llmFormat: input.format ?? "openai",
      ...(input.autoSummarize !== undefined ? { autoSummarize: input.autoSummarize } : {}),
      ...(input.autoTag !== undefined ? { autoTag: input.autoTag } : {}),
    });
    return;
  }
  await db
    .update(emailSubscriptions)
    .set({
      llmEnabled: input.enabled,
      llmBaseUrl: input.baseUrl || null,
      llmApiKey: apiKeyToStore,
      llmModel: input.model || null,
      llmFormat: input.format ?? existing.llmFormat ?? "openai",
      ...(input.autoSummarize !== undefined ? { autoSummarize: input.autoSummarize } : {}),
      ...(input.autoTag !== undefined ? { autoTag: input.autoTag } : {}),
      updatedAt: new Date(),
    })
    .where(eq(emailSubscriptions.id, existing.id));
}

export async function getUsersWithAutoTagEnabled(): Promise<string[]> {
  const rows = await db
    .select({ userId: emailSubscriptions.userId })
    .from(emailSubscriptions)
    .where(and(eq(emailSubscriptions.autoTag, true), eq(emailSubscriptions.llmEnabled, true)));
  return rows.map((r) => r.userId);
}

export async function getUsersWithAutoSummarizeEnabled(): Promise<string[]> {
  const rows = await db
    .select({ userId: emailSubscriptions.userId })
    .from(emailSubscriptions)
    .where(
      and(eq(emailSubscriptions.autoSummarize, true), eq(emailSubscriptions.llmEnabled, true)),
    );
  return rows.map((r) => r.userId);
}
