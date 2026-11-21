import { describe, expect, it } from "vitest";
import {
  MAX_REGEX_LENGTH,
  getAllowedActionTypesForScope,
  getAllowedFieldsForScope,
  reorderIds,
  sanitizeDraftForScope,
  validateRuleDraft,
} from "@/components/settings/rule-validation";
import {
  buildChannelConfigPayload,
  validateChannelDraft,
} from "@/components/settings/channel-schema";

describe("rule validation", () => {
  it("accepts a valid article rule with regex and multiple actions", () => {
    const err = validateRuleDraft({
      name: "AI 重要文章",
      scope: "article",
      matchMode: "all",
      conditions: [
        { field: "title", op: "regex", value: "(LLM|Agent)" },
        { field: "feedId", op: "equals", value: "feed-1" },
      ],
      actions: [
        { type: "star" },
        { type: "addTag", tagId: "tag-1" },
        { type: "fetchFullText" },
        { type: "notify", channelIds: ["ch-1"] },
      ],
    });
    expect(err).toBeNull();
  });

  it("rejects invalid regex syntax and regexes longer than 200 chars", () => {
    const invalidSyntax = validateRuleDraft({
      name: "坏正则",
      scope: "article",
      matchMode: "all",
      conditions: [{ field: "title", op: "regex", value: "[unclosed" }],
      actions: [{ type: "markRead" }],
    });
    expect(invalidSyntax).toContain("正则表达式语法无效");

    const tooLong = validateRuleDraft({
      name: "超长正则",
      scope: "article",
      matchMode: "all",
      conditions: [{ field: "title", op: "regex", value: "a".repeat(MAX_REGEX_LENGTH + 1) }],
      actions: [{ type: "markRead" }],
    });
    expect(tooLong).toContain(`${MAX_REGEX_LENGTH}`);
  });

  it("restricts hot scope to notify actions and hot-compatible fields", () => {
    expect(getAllowedActionTypesForScope("hot")).toEqual(["notify"]);
    expect(getAllowedFieldsForScope("hot")).toEqual(["title", "content", "url", "hotSource"]);

    const wrongAction = validateRuleDraft({
      name: "热榜标已读",
      scope: "hot",
      matchMode: "any",
      conditions: [{ field: "title", op: "contains", value: "发布" }],
      actions: [{ type: "markRead" }],
    });
    expect(wrongAction).toContain("热榜规则仅支持发送通知");

    const wrongField = validateRuleDraft({
      name: "热榜用作者",
      scope: "hot",
      matchMode: "any",
      conditions: [{ field: "author", op: "contains", value: "张三" }],
      actions: [{ type: "notify", channelIds: ["ch-1"] }],
    });
    expect(wrongField).toContain("不适用于当前作用域");
  });

  it("requires tagId for addTag and at least one channelId for notify", () => {
    expect(
      validateRuleDraft({
        name: "缺标签",
        scope: "article",
        matchMode: "all",
        conditions: [{ field: "title", op: "contains", value: "test" }],
        actions: [{ type: "addTag", tagId: "" }],
      }),
    ).toContain("标签");

    expect(
      validateRuleDraft({
        name: "缺渠道",
        scope: "hot",
        matchMode: "all",
        conditions: [{ field: "hotSource", op: "equals", value: "zhihu" }],
        actions: [{ type: "notify", channelIds: [] }],
      }),
    ).toContain("通知渠道");
  });

  it("sanitizes conditions and actions when switching scope to hot", () => {
    const sanitized = sanitizeDraftForScope(
      "hot",
      [
        { field: "feedId", op: "equals", value: "f-1" },
        { field: "title", op: "contains", value: "AI" },
      ],
      [{ type: "star" }, { type: "hide" }],
    );
    expect(sanitized.conditions).toEqual([
      { field: "title", op: "contains", value: "" },
      { field: "title", op: "contains", value: "AI" },
    ]);
    expect(sanitized.actions).toEqual([{ type: "notify", channelIds: [] }]);
  });

  it("reorders ids immutably", () => {
    expect(reorderIds(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    const same = ["a", "b"];
    expect(reorderIds(same, 0, 0)).toBe(same);
  });
});

describe("notification channel schema", () => {
  it("requires secret fields on create but allows leaving configured secrets blank on edit", () => {
    expect(
      validateChannelDraft({
        type: "telegram",
        name: "我的 TG",
        values: { botToken: "", chatId: "12345" },
        configuredSecrets: [],
        isEdit: false,
      }),
    ).toContain("Bot Token");

    expect(
      validateChannelDraft({
        type: "telegram",
        name: "我的 TG",
        values: { botToken: "", chatId: "12345" },
        configuredSecrets: ["botToken"],
        isEdit: true,
      }),
    ).toBeNull();
  });

  it("omits untouched secret fields on edit and applies default serverUrl for bark/ntfy", () => {
    expect(buildChannelConfigPayload("webhook", { url: "", secret: "new-secret" }, true)).toEqual({
      secret: "new-secret",
    });

    expect(
      buildChannelConfigPayload("bark", { serverUrl: "", deviceKey: "dev-key" }, false),
    ).toEqual({
      serverUrl: "https://api.day.app",
      deviceKey: "dev-key",
    });

    expect(buildChannelConfigPayload("webpush", {}, false)).toEqual({});
  });
});
