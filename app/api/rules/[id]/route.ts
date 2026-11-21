import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { deleteRule, ownsReferences, updateRule } from "@/lib/db/queries/rules";
import { ruleDto } from "@/lib/rules/dto";
import { rulePatchSchema, ruleSchema } from "@/lib/rules/validation";

const missing = () => Response.json({ success: false, error: "规则不存在" }, { status: 404 });
export const PATCH = withAuth(async (req, { user }, ctx) => {
  const id = z.uuid().parse((await ctx.params).id);
  const patch = rulePatchSchema.parse(await req.json().catch(() => null));
  if (patch.actions && !(await ownsReferences(user.id, patch.actions)))
    return Response.json({ success: false, error: "标签或通知渠道不存在" }, { status: 400 });
  const row = await updateRule(
    user.id,
    id,
    async ({ name, enabled, scope, matchMode, conditions, actions }) =>
      ruleSchema.parse({ name, enabled, scope, matchMode, conditions, actions, ...patch }),
  );
  return row ? Response.json({ success: true, data: ruleDto(row) }) : missing();
});

export const DELETE = withAuth(async (_req, { user }, ctx) => {
  const id = z.uuid().parse((await ctx.params).id);
  const row = await deleteRule(user.id, id);
  return row ? Response.json({ success: true, data: row }) : missing();
});
