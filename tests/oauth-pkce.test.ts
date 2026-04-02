import { describe, it, expect } from "vitest";
import { verifyPKCE } from "../lib/oauth/pkce";

describe("PKCE verification", () => {
  it("verifies a valid S256 code_verifier against code_challenge", async () => {
    // Generate a code verifier
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    // Compute expected challenge: BASE64URL(SHA256(verifier))
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier)
    );
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(await verifyPKCE(verifier, challenge, "S256")).toBe(true);
  });

  it("rejects an invalid code_verifier", async () => {
    expect(await verifyPKCE("wrong", "some-challenge", "S256")).toBe(false);
  });

  it("rejects non-S256 methods", async () => {
    expect(await verifyPKCE("any", "any", "plain")).toBe(false);
  });
});
