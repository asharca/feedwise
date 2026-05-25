// lib/email/click-token.ts
import { createHmac, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY env var is required for click tokens");
  return Buffer.from(raw, "base64");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(payload: string): string {
  return b64url(createHmac("sha256", key()).update(payload).digest());
}

/** Tamper-proof token encoding (userId, articleId). No URL is stored. */
export function signClickToken(userId: string, articleId: string): string {
  const payload = b64url(Buffer.from(`${userId}:${articleId}`, "utf8"));
  return `${payload}.${hmac(payload)}`;
}

export function verifyClickToken(token: string): { userId: string; articleId: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const decoded = fromB64url(payload).toString("utf8");
  const sep = decoded.lastIndexOf(":"); // articleId (uuid) has no colon
  if (sep <= 0) return null;
  const userId = decoded.slice(0, sep);
  const articleId = decoded.slice(sep + 1);
  if (!userId || !articleId) return null;
  return { userId, articleId };
}
