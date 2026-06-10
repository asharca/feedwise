import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export interface AccountUpdate {
  name?: string;
  email?: string;
}

export type UpdateAccountResult =
  | { ok: true; account: Record<string, unknown> }
  | { ok: false; reason: "email-taken" };

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; cause?: unknown };
  if (e.code === "23505") return true;
  return isUniqueViolation(e.cause);
}

export async function getAccount(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  return user ?? null;
}

/**
 * Update name/email. Email uniqueness is enforced by the DB constraint —
 * a violation maps to { ok: false, reason: "email-taken" } so concurrent
 * updates can't race past a check-then-set.
 */
export async function updateAccount(
  userId: string,
  data: AccountUpdate,
): Promise<UpdateAccountResult> {
  try {
    const [updated] = await db
      .update(users)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return { ok: true, account: updated };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "email-taken" };
    throw err;
  }
}

export async function getUserSettings(userId: string): Promise<Record<string, unknown>> {
  const [user] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId));
  return (user?.settings as Record<string, unknown>) ?? {};
}

export async function patchUserSettings(
  userId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const current = await getUserSettings(userId);
  const merged = { ...current, ...patch };
  await db.update(users).set({ settings: merged }).where(eq(users.id, userId));
  return merged;
}
