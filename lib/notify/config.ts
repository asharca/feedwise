import { z } from "zod";
import type { NotificationChannelType } from "@/lib/db/schema-types";
import type { notificationChannels } from "@/lib/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";
import { channels } from "./channels";

type Config = Record<string, string>;
export type ChannelRow = typeof notificationChannels.$inferSelect;
export const secretFields: Record<NotificationChannelType, readonly string[]> = {
  webhook: ["url", "secret"],
  telegram: ["botToken"],
  bark: ["deviceKey"],
  ntfy: ["token"],
  feishu: ["webhookUrl", "secret"],
  dingtalk: ["webhookUrl", "secret"],
  wecom: ["webhookUrl"],
  webpush: [],
};
const name = z.string().trim().min(1).max(100);
const config = z.record(z.string(), z.string());
export const createSchema = z.strictObject({
  type: z.enum(["webhook", "telegram", "bark", "ntfy", "feishu", "dingtalk", "wecom", "webpush"]),
  name,
  config,
});
export const patchSchema = z.strictObject({
  name: name.optional(),
  enabled: z.boolean().optional(),
  config: config.optional(),
});

export function mergeConfig(type: NotificationChannelType, stored: Config, patch: Config) {
  const merged = { ...stored, ...patch };
  for (const key of secretFields[type]) {
    if (patch[key] === "" && stored[key]) merged[key] = stored[key];
  }
  return config.parse(channels[type].schema.parse(merged));
}

export function sealConfig(type: NotificationChannelType, parsed: Config) {
  return type === "webpush" ? null : encryptSecret(JSON.stringify(parsed));
}
export function openConfig(row: ChannelRow): Config {
  return row.config === null ? {} : config.parse(JSON.parse(decryptSecret(row.config)));
}
export function channelDto(row: ChannelRow) {
  const { id, type, name, enabled, lastError, lastSentAt, createdAt } = row;
  const config = openConfig(row);
  const configuredSecrets = secretFields[type].filter((key) => Boolean(config[key]));
  for (const key of secretFields[type]) config[key] = "";
  return { id, type, name, enabled, config, configuredSecrets, lastError, lastSentAt, createdAt };
}
