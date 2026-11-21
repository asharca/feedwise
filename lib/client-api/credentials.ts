import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/.exec(stored);
  if (!parts) return false;
  const key = (await derive(password, parts[1], 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(parts[2], "hex"));
}

export const feverKey = (email: string, password: string) =>
  createHash("md5").update(`${email}:${password}`).digest("hex");
export const newClientToken = () => randomBytes(32).toString("hex");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

// Stable across the user's client sessions, invalidated by replacing the API password.
export const actionToken = (userId: string, credentialHash: string) =>
  createHmac("sha256", credentialHash)
    .update(`greader:action:${userId}`)
    .digest("hex")
    .slice(0, 57);

export function validActionToken(token: string | null, expected: string) {
  return (
    !!token &&
    /^[a-f0-9]{57}$/.test(token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  );
}
