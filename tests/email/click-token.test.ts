// tests/email/click-token.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { signClickToken, verifyClickToken } from "@/lib/email/click-token";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("click-token", () => {
  it("round-trips userId + articleId", () => {
    const t = signClickToken("user-1", "11111111-1111-4111-a111-000000000001");
    expect(verifyClickToken(t)).toEqual({
      userId: "user-1",
      articleId: "11111111-1111-4111-a111-000000000001",
    });
  });
  it("handles userIds containing colons", () => {
    const t = signClickToken("a:b:c", "11111111-1111-4111-a111-000000000001");
    expect(verifyClickToken(t)).toEqual({
      userId: "a:b:c",
      articleId: "11111111-1111-4111-a111-000000000001",
    });
  });
  it("rejects a tampered signature", () => {
    const t = signClickToken("user-1", "id-1");
    expect(verifyClickToken(t.slice(0, -2) + "xx")).toBeNull();
  });
  it("rejects a correctly-sized but wrong signature", () => {
    const [payload] = signClickToken("user-1", "id-1").split(".");
    const otherSig = signClickToken("attacker", "id-1").split(".")[1];
    expect(verifyClickToken(`${payload}.${otherSig}`)).toBeNull();
  });
  it("rejects a token with an empty signature", () => {
    const [payload] = signClickToken("user-1", "id-1").split(".");
    expect(verifyClickToken(`${payload}.`)).toBeNull();
  });
  it("rejects malformed tokens", () => {
    expect(verifyClickToken("garbage")).toBeNull();
    expect(verifyClickToken("")).toBeNull();
  });
});
