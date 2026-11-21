// @vitest-environment node
import { createHash } from "node:crypto";
import { authorization, callbackUrl, registration, validApproval } from "@/lib/oauth/authorization";
import {
  digest,
  exchangeToken,
  type AuthCode,
  type Grant,
  type OAuthClient,
  type TokenStore,
} from "@/lib/oauth/tokens";
import { describe, it, expect } from "vitest";
import { verifyPKCE } from "../lib/oauth/pkce";

describe("PKCE verification", () => {
  it("verifies a valid S256 code_verifier against code_challenge", async () => {
    // Generate a code verifier
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    // Compute expected challenge: BASE64URL(SHA256(verifier))
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
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

const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const resource = "https://feedwise.test/api/mcp";
const clientId = "418879c8-0786-44e2-be22-33387bf46480";
const redirectUri = "http://127.0.0.1:3000/callback";

function fixture(method: OAuthClient["token_endpoint_auth_method"] = "none") {
  const client: OAuthClient = {
    client_id: clientId,
    redirect_uris: [redirectUri],
    client_name: "test",
    token_endpoint_auth_method: method,
    secretHash: method !== "none" ? digest("secret") : undefined,
  };
  const grant: AuthCode = {
    clientId,
    resource,
    userId: "owner",
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  };
  const codes = new Map([["once", grant]]),
    refreshes = new Map<string, Grant>();
  const store: TokenStore = {
    getClient: async (id) => (id === clientId ? client : null),
    getCode: async (code) => codes.get(code) ?? null,
    consumeCode: async (code) => codes.delete(code),
    issue: async (grant, _access, refresh) => {
      refreshes.set(refresh, grant);
    },
    rotate: async (id, target, old, _access, refresh) => {
      const grant = refreshes.get(old);
      if (!grant || grant.clientId !== id || target !== grant.resource) return false;
      refreshes.delete(old);
      refreshes.set(refresh, grant);
      return true;
    },
  };
  const params = {
    grant_type: "authorization_code",
    code: "once",
    code_verifier: verifier,
    client_id: clientId,
    redirect_uri: redirectUri,
  };
  const exchange = (data: Record<string, string>, header: string | null = null) =>
    exchangeToken(new URLSearchParams(data), header, resource, store);
  return { params, exchange, refreshes };
}

describe("token grants", () => {
  it("binds PKCE, callback, resource and client before consuming a code once under concurrent exchanges", async () => {
    const { params, exchange } = fixture();
    const overrides: Record<string, string>[] = [
      { code_verifier: "w".repeat(43) },
      { redirect_uri: redirectUri + "/" },
      { resource: "https://other.test" },
      { client_id: "other" },
    ];
    for (const override of overrides) {
      expect((await exchange({ ...params, ...override })).status).not.toBe(200);
    }
    const results = await Promise.all([exchange(params), exchange(params)]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 400]);
    expect(results.find((x) => x.status === 400)?.body).toEqual({ error: "invalid_grant" });
  });
  it("rotates refresh tokens and rejects the spent handle", async () => {
    const { params, exchange, refreshes } = fixture();
    const first = await exchange(params);
    expect(first.body).toMatchObject({ expires_in: 3600, token_type: "Bearer" });
    if (!("refresh_token" in first.body)) throw new Error("expected grant");
    const refresh = {
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token,
      client_id: clientId,
    };
    const second = await exchange(refresh);
    expect(second.status).toBe(200);
    expect(second.body).not.toEqual(first.body);
    expect([...refreshes.values()]).toEqual([{ clientId, resource, userId: "owner" }]);
    expect((await exchange(refresh)).body).toEqual({ error: "invalid_grant" });
  });
  it("requires the registered client authentication method", async () => {
    const { params, exchange } = fixture("client_secret_basic");
    expect((await exchange(params)).status).toBe(401);
    expect((await exchange({ ...params, client_secret: "secret" })).status).toBe(401);
    expect((await exchange(params, `Basic ${btoa(clientId + ":wrong")}`)).status).toBe(401);
    expect((await exchange(params, `Basic ${btoa(clientId + ":secret")}`)).status).toBe(200);
  });
});

it("validates registration, exact redirect matching, and opaque state passthrough", () => {
  const request = authorization.parse({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "a/+?&=",
  });
  expect(validApproval(request, [redirectUri + "/"], resource)).toBe(false);
  expect(validApproval(request, [redirectUri], resource)).toBe(true);
  const url = new URL(callbackUrl(request, { error: "access_denied" }));
  expect(url.searchParams.get("state")).toBe(request.state);
  expect(url.searchParams.get("error")).toBe("access_denied");
  for (const uri of ["javascript:alert(1)", "http://example.org", "https://example.org/#frag"]) {
    expect(registration.safeParse({ redirect_uris: [uri] }).success).toBe(false);
  }
});
