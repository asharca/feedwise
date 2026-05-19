import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

const VALID_KEY = randomBytes(32).toString("base64");

describe("lib/crypto/secrets", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEnv;
  });

  it("encrypts and decrypts a string roundtrip", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/secrets");
    const plain = "sk-test-1234567890abcdef";
    const ciphertext = encryptSecret(plain);
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(ciphertext).not.toContain(plain);
    expect(decryptSecret(ciphertext)).toBe(plain);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto/secrets");
    expect(encryptSecret("same-plain")).not.toBe(encryptSecret("same-plain"));
  });

  it("isEncrypted detects v1 prefix", async () => {
    const { isEncrypted, encryptSecret } = await import("@/lib/crypto/secrets");
    expect(isEncrypted("plain-string")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
  });

  it("throws SecretDecryptionError on tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret, SecretDecryptionError } = await import(
      "@/lib/crypto/secrets"
    );
    const ct = encryptSecret("hello");
    // Flip chars in the ciphertext segment to ensure real data bytes change (not just padding)
    const parts = ct.split(":");
    const firstChar = parts[2][0];
    const flippedFirst = firstChar === "A" ? "B" : "A";
    const tamperedCipher =
      flippedFirst +
      parts[2].slice(1, -2) +
      (parts[2].endsWith("A") ? "B" : "A") +
      "=";
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCipher}:${parts[3]}`;
    expect(() => decryptSecret(tampered)).toThrow(SecretDecryptionError);
  });

  it("throws SecretDecryptionError on malformed input", async () => {
    const { decryptSecret, SecretDecryptionError } = await import("@/lib/crypto/secrets");
    expect(() => decryptSecret("not-encrypted")).toThrow(SecretDecryptionError);
    expect(() => decryptSecret("v1:only:two")).toThrow(SecretDecryptionError);
    expect(() => decryptSecret("v2:a:b:c")).toThrow(SecretDecryptionError); // unknown version
  });

  it("throws if ENCRYPTION_KEY missing", async () => {
    delete process.env.ENCRYPTION_KEY;
    // Re-import after mutating env: use vitest's import.meta or just re-require
    const mod = await import("@/lib/crypto/secrets?missingkey" as string).catch((e) => e);
    // Easier: validate via assertKeyConfigured()
    process.env.ENCRYPTION_KEY = VALID_KEY;
    const { assertKeyConfigured } = await import("@/lib/crypto/secrets");
    delete process.env.ENCRYPTION_KEY;
    expect(() => assertKeyConfigured()).toThrow(/ENCRYPTION_KEY/);
  });

  it("throws if ENCRYPTION_KEY wrong length", async () => {
    process.env.ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    const { assertKeyConfigured } = await import("@/lib/crypto/secrets");
    expect(() => assertKeyConfigured()).toThrow(/32 bytes/);
  });
});
