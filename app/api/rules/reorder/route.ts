import { withAuth } from "@/lib/api/with-auth";
import { reorderSchema } from "@/lib/rules/validation";
import { reorderRules } from "@/lib/db/queries/rules";

export const POST = withAuth(async (req, { user }) => {
  const { ids } = reorderSchema.parse(await req.json().catch(() => null));
  if (!(await reorderRules(user.id, ids)))
    return Response.json({ success: false, error: "请提供全部规则 ID" }, { status: 400 });
  return Response.json({ success: true, data: { ids } });
});
