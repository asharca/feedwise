import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { feverKey, hashPassword } from "@/lib/client-api/credentials";
import { json, originOf } from "@/lib/client-api/http";
import { accessConfigured, replaceAccess } from "@/lib/db/queries/client-api";

function settings(req: Request, username: string, configured: boolean) {
  const origin = originOf(req);
  return json({
    success: true,
    data: {
      configured,
      username,
      greaderUrl: `${origin}/api/greader`,
      feverUrl: `${origin}/api/fever`,
    },
  });
}

export const GET = withAuth(async (req, { user }) =>
  settings(req, user.email, await accessConfigured(user.id)),
);

export const PUT = withAuth(async (req, { user }) => {
  const { password } = z
    .object({ password: z.string().min(8) })
    .parse(await req.json().catch(() => null));
  await replaceAccess(user.id, {
    passwordHash: await hashPassword(password),
    feverKey: feverKey(user.email, password),
  });
  return settings(req, user.email, true);
});

export const DELETE = withAuth(async (req, { user }) => {
  await replaceAccess(user.id, null);
  return settings(req, user.email, false);
});
