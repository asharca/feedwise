import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getAccount, updateAccount } from "@/lib/db/queries/account";

const updateSchema = z.object({
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
});

export const GET = withAuth(async (_req, session) => {
  const account = await getAccount(session.user.id);
  return NextResponse.json({ success: true, data: account });
});

export const PUT = withAuth(async (req, session) => {
  const body = await req.json();
  const parsed = updateSchema.parse(body);

  const result = await updateAccount(session.user.id, parsed);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: "Email already in use" }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: result.account });
});
