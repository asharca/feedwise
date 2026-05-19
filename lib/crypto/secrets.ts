import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = "v1";

export class SecretDecryptionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "SecretDecryptionError";
  }
}

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY env var is required for secret encryption");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key;
}

export function assertKeyConfigured(): void {
  loadKey();
}

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(`${VERSION}:`)) {
    throw new SecretDecryptionError(`Unsupported secret format (expected ${VERSION}: prefix)`);
  }
  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new SecretDecryptionError("Malformed encrypted secret (expected 4 segments)");
  }
  const [, ivB64, ctB64, tagB64] = parts;
  let iv: Buffer, ct: Buffer, tag: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    ct = Buffer.from(ctB64, "base64");
    tag = Buffer.from(tagB64, "base64");
  } catch (e) {
    throw new SecretDecryptionError("Base64 decode failed", e);
  }
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new SecretDecryptionError("IV or auth tag has wrong length");
  }
  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8");
  } catch (e) {
    throw new SecretDecryptionError(
      "Authentication tag mismatch (key wrong or ciphertext tampered)",
      e
    );
  }
}

/**
 * Decrypt only if value looks encrypted; otherwise return as-is.
 * Used during migration when DB may contain mixed plaintext + ciphertext.
 */
export function decryptIfEncrypted(value: string | null): string | null {
  if (value == null) return null;
  return isEncrypted(value) ? decryptSecret(value) : value;
}
