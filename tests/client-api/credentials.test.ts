import { expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
  actionToken,
  validActionToken,
  newClientToken,
  feverKey,
} from "@/lib/client-api/credentials";
import { createHash } from "node:crypto";

it("uses a fresh salt per credential and verifies only the dedicated password", async () => {
  const password = "密碼:very-long";
  const a = await hashPassword(password),
    b = await hashPassword(password);
  expect(a).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  expect(a).not.toBe(b);
  expect(await verifyPassword(password, a)).toBe(true);
  expect(await verifyPassword("login-password", a)).toBe(false);
  expect(await verifyPassword(password, "scrypt:00:11")).toBe(false);
  expect(feverKey("me@example.org", password)).toBe(
    createHash("md5").update(`me@example.org:${password}`).digest("hex"),
  );
});

it("issues random bearer secrets and distinct user/credential-bound action tokens", () => {
  const t = newClientToken();
  expect(t).toMatch(/^[a-f0-9]{64}$/);
  expect(newClientToken()).not.toBe(t);
  expect(tokenHash(t)).not.toBe(t);
  const csrf = actionToken("a", "hash1");
  expect(validActionToken(csrf, actionToken("a", "hash1"))).toBe(true);
  expect(validActionToken(csrf, actionToken("a", "hash2"))).toBe(false);
  expect(validActionToken(csrf, actionToken("b", "hash1"))).toBe(false);
  expect(validActionToken("x", csrf)).toBe(false);
  expect(validActionToken(null, csrf)).toBe(false);
});
