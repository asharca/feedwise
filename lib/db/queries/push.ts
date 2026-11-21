import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions as push } from "@/lib/db/schema";

export function subscriptionsForUser(userId: string) {
  return db
    .select({ endpoint: push.endpoint, keys: { p256dh: push.p256dh, auth: push.auth } })
    .from(push)
    .where(eq(push.userId, userId));
}

export async function saveSubscription(
  userId: string,
  endpoint: string,
  keys: { p256dh: string; auth: string },
  userAgent: string | null,
) {
  // A conflict with another account must not move or overwrite its subscription.
  const [row] = await db
    .insert(push)
    .values({ userId, endpoint, ...keys, userAgent })
    .onConflictDoUpdate({
      target: push.endpoint,
      set: { ...keys, userAgent },
      setWhere: eq(push.userId, userId),
    })
    .returning({ id: push.id });
  return row;
}

export function removeSubscription(userId: string, endpoint: string) {
  return db.delete(push).where(and(eq(push.userId, userId), eq(push.endpoint, endpoint)));
}
