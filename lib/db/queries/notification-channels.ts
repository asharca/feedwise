import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationChannels as channels } from "@/lib/db/schema";
import type { NotificationChannelType } from "@/lib/db/schema-types";

type ChannelRow = typeof channels.$inferSelect;
const owned = (userId: string, id: string) => and(eq(channels.userId, userId), eq(channels.id, id));
export function listChannels(userId: string) {
  return db
    .select()
    .from(channels)
    .where(eq(channels.userId, userId))
    .orderBy(asc(channels.createdAt), asc(channels.id));
}
export async function getChannel(userId: string, id: string) {
  const [row] = await db.select().from(channels).where(owned(userId, id));
  return row;
}
export async function createChannel(
  userId: string,
  type: NotificationChannelType,
  name: string,
  config: string | null,
) {
  const [row] = await db.insert(channels).values({ userId, type, name, config }).returning();
  return row;
}
export function patchChannel(
  userId: string,
  id: string,
  changes: (row: ChannelRow) => Partial<Pick<ChannelRow, "name" | "enabled" | "config">>,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(channels).where(owned(userId, id)).for("update");
    if (!current) return null;
    const [row] = await tx
      .update(channels)
      .set({ ...changes(current), updatedAt: new Date() })
      .where(owned(userId, id))
      .returning();
    return row;
  });
}
export async function deleteChannel(userId: string, id: string) {
  const [row] = await db.delete(channels).where(owned(userId, id)).returning({ id: channels.id });
  return row;
}
export function recordDelivery(userId: string, id: string, lastError: string | null) {
  return db
    .update(channels)
    .set(lastError ? { lastError } : { lastError: null, lastSentAt: new Date() })
    .where(owned(userId, id));
}
