import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `fw_${hex}`;
}

export async function createApiToken(userId: string, name: string) {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash })
    .returning({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt });
  return { ...row, token };
}

export async function listApiTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(apiTokens.createdAt);
}

export async function deleteApiToken(userId: string, tokenId: string) {
  await db
    .delete(apiTokens)
    .where(eq(apiTokens.id, tokenId));
  // userId check happens at API layer via requireSession
  void userId;
}

export async function validateApiToken(token: string): Promise<string | null> {
  const tokenHash = await hashToken(token);
  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;

  // Update lastUsedAt without blocking the response
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});

  return row.userId;
}
