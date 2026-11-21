import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ClientAuthMethod } from "./metadata";
import { verifyPKCE } from "./pkce";

export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 30 * 24 * 60 * 60;
export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: ClientAuthMethod;
  secretHash?: string;
}
export interface Grant {
  userId: string;
  clientId: string;
  resource: string;
}
export interface AuthCode extends Grant {
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}
export interface TokenStore {
  getClient(id: string): Promise<OAuthClient | null>;
  getCode(code: string): Promise<AuthCode | null>;
  consumeCode(code: string): Promise<boolean>;
  issue(grant: Grant, access: string, refresh: string): Promise<void>;
  rotate(
    clientId: string,
    resource: string,
    old: string,
    access: string,
    refresh: string,
  ): Promise<boolean>;
}

function credentials(params: URLSearchParams, header: string | null) {
  if (!header)
    return {
      id: params.get("client_id"),
      secret: params.get("client_secret"),
      method: params.has("client_secret") ? "client_secret_post" : "none",
    };
  if (params.has("client_secret") || !/^Basic [a-z0-9+/]+=*$/i.test(header)) return null;
  try {
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(":");
    if (i < 1) return null;
    const id = decodeURIComponent(decoded.slice(0, i));
    if (params.has("client_id") && params.get("client_id") !== id) return null;
    return { id, secret: decodeURIComponent(decoded.slice(i + 1)), method: "client_secret_basic" };
  } catch {
    return null;
  }
}

const failure = (error: string, status = 400) => ({ body: { error }, status });

/** The route only decodes the form; all credential, binding and grant decisions live here. */
export async function exchangeToken(
  params: URLSearchParams,
  header: string | null,
  resource: string,
  store: TokenStore,
  generate = randomToken,
) {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) return failure("invalid_request");
    seen.add(key);
  }
  if (params.has("resource") && params.get("resource") !== resource)
    return failure("invalid_target");
  if (params.has("scope") && params.get("scope") !== "mcp") return failure("invalid_scope");
  const auth = credentials(params, header);
  const client = auth?.id ? await store.getClient(auth.id) : null;
  if (
    !auth ||
    !client ||
    client.token_endpoint_auth_method !== auth.method ||
    (auth.method !== "none" &&
      (!auth.secret ||
        !client.secretHash ||
        !timingSafeEqual(Buffer.from(digest(auth.secret)), Buffer.from(client.secretHash))))
  ) {
    return failure("invalid_client", 401);
  }
  const access = generate(),
    refresh = generate();
  switch (params.get("grant_type")) {
    case "authorization_code": {
      const code = params.get("code"),
        verifier = params.get("code_verifier");
      if (!code || !verifier || !params.get("redirect_uri")) return failure("invalid_request");
      const grant = await store.getCode(code);
      if (
        !grant ||
        grant.clientId !== client.client_id ||
        grant.resource !== resource ||
        grant.redirectUri !== params.get("redirect_uri") ||
        !(await verifyPKCE(verifier, grant.codeChallenge, grant.codeChallengeMethod)) ||
        !(await store.consumeCode(code))
      )
        return failure("invalid_grant");
      await store.issue(
        { userId: grant.userId, clientId: grant.clientId, resource },
        access,
        refresh,
      );
      break;
    }
    case "refresh_token": {
      const old = params.get("refresh_token");
      if (!old) return failure("invalid_request");
      if (!(await store.rotate(client.client_id, resource, old, access, refresh)))
        return failure("invalid_grant");
      break;
    }
    default:
      return failure("unsupported_grant_type");
  }
  return {
    status: 200,
    body: {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: ACCESS_TTL,
      scope: "mcp",
    },
  };
}
