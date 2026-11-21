import { withAuth } from "@/lib/api/with-auth";
import { previewSchema } from "@/lib/rules/validation";
import { previewRule } from "@/lib/rules/preview";

export const POST = withAuth(async (req, { user }) => {
  const input = previewSchema.parse(await req.json().catch(() => null));
  return Response.json({ success: true, data: await previewRule(user.id, input) });
});
