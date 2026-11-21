// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { channelDto, mergeConfig, openConfig, sealConfig } from "@/lib/notify/config";
import type { NotificationChannelType } from "@/lib/db/schema-types";

afterEach(() => vi.unstubAllEnvs());
const inputs: Array<[NotificationChannelType, Record<string, string>, string[]]> = [
  ["webhook", { url: "https://example.com/a", secret: "asymmetric-example" }, ["url", "secret"]],
  ["telegram", { botToken: "123:test", chatId: "chat" }, ["botToken"]],
  ["bark", { deviceKey: "device" }, ["deviceKey"]],
  ["ntfy", { topic: "testing", token: "bearer-token" }, ["token"]],
  [
    "dingtalk",
    { webhookUrl: "https://a.example/robot", secret: "signed" },
    ["webhookUrl", "secret"],
  ],
  ["feishu", { webhookUrl: "https://b.example/robot", secret: "signed" }, ["webhookUrl", "secret"]],
  ["wecom", { webhookUrl: "https://c.example/robot" }, ["webhookUrl"]],
  ["webpush", {}, []],
];
it.each(inputs)(
  "masks %s secrets only, preserving them on empty and omitted PATCH",
  (type, input, secrets) => {
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    const parsed = mergeConfig(type, {}, input);
    const row = {
      id: "chan",
      userId: "user",
      type,
      name: "channel",
      enabled: true,
      lastError: null,
      lastSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      config: sealConfig(type, parsed),
    };
    if (type !== "webpush") expect(row.config).toMatch(/^v1:/);
    expect(openConfig(row)).toEqual(parsed);
    const dto = channelDto(row);
    expect(dto).not.toHaveProperty("userId");
    expect(dto).not.toHaveProperty("updatedAt");
    expect(dto.configuredSecrets).toEqual(secrets);
    for (const secret of secrets) expect(dto.config[secret]).toBe("");
    for (const [key, value] of Object.entries(parsed))
      if (!secrets.includes(key)) expect(dto.config[key]).toBe(value);
    expect(mergeConfig(type, parsed, dto.config)).toEqual(parsed);
    expect(mergeConfig(type, parsed, {})).toEqual(parsed);
  },
);
it("replaces non-empty secrets, applies defaults and rejects unknown config keys", () => {
  expect(mergeConfig("ntfy", { token: "old", topic: "a" }, { token: "new", topic: "b" })).toEqual({
    serverUrl: "https://ntfy.sh",
    token: "new",
    topic: "b",
  });
  expect(() => mergeConfig("webpush", {}, { url: "not used" })).toThrow();
  expect(() => mergeConfig("webhook", {}, { url: "file:///tmp" })).toThrow();
});
