import { z } from "zod";
import { compileRegex } from "./evaluate";

const condition = z
  .strictObject({
    field: z.enum(["title", "content", "url", "author", "feedId", "folderId", "hotSource"]),
    op: z.enum(["contains", "notContains", "equals", "notEquals", "regex"]),
    value: z.string().min(1),
  })
  .refine(
    ({ op, value }) => {
      if (op !== "regex") return true;
      try {
        compileRegex(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "正则表达式无效或超过 200 个字符", path: ["value"] },
  );

const action = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("markRead") }),
  z.strictObject({ type: z.literal("star") }),
  z.strictObject({ type: z.literal("hide") }),
  z.strictObject({ type: z.literal("fetchFullText") }),
  z.strictObject({ type: z.literal("addTag"), tagId: z.uuid() }),
  z.strictObject({ type: z.literal("notify"), channelIds: z.array(z.uuid()).min(1) }),
]);

const definition = z.strictObject({
  scope: z.enum(["article", "hot"]),
  matchMode: z.enum(["all", "any"]),
  conditions: z.array(condition),
});

function validFields({ scope, conditions }: z.infer<typeof definition>) {
  return conditions.every(({ field }) =>
    scope === "hot"
      ? ["title", "content", "url", "hotSource"].includes(field)
      : field !== "hotSource",
  );
}

const fields = definition.extend({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  actions: z.array(action),
});

export const rulePatchSchema = fields.partial();
export const previewSchema = definition.refine(validFields, "条件字段不适用于此规则范围");
export const ruleSchema = fields
  .refine(validFields, "条件字段不适用于此规则范围")
  .refine(
    (r) => r.scope !== "hot" || r.actions.every((a) => a.type === "notify"),
    "热榜规则仅支持通知动作",
  );
export type RuleInput = z.infer<typeof ruleSchema>;
export const reorderSchema = z.strictObject({
  ids: z.array(z.uuid()).refine((ids) => ids.length === new Set(ids).size, "规则 ID 重复"),
});
