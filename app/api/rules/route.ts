import { withAuth } from "@/lib/api/with-auth";
import { createRule, listRules, ownsReferences } from "@/lib/db/queries/rules";
import { ruleDto } from "@/lib/rules/dto";
import { ruleSchema } from "@/lib/rules/validation";

export const GET = withAuth(async (_req, { user }) => {
  const rows = await listRules(user.id);
  return Response.json({ success: true, data: rows.map(ruleDto) });
});

export const POST = withAuth(async (req, { user }) => {
  const input = ruleSchema.parse(await req.json().catch(() => null));
  if (!(await ownsReferences(user.id, input.actions)))
    return Response.json({ success: false, error: "标签或通知渠道不存在" }, { status: 400 });
  const row = await createRule(user.id, input);
  return Response.json({ success: true, data: ruleDto(row) });
});
