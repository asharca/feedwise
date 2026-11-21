import { z } from "zod";
import { authMethods } from "./metadata";

function isSafeRedirect(value: string) {
  try {
    const url = new URL(value);
    if (url.username || url.password || value.includes("#") || /[\s\\]/.test(value)) return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
      // RFC 8252 private-use schemes must be based on a reversed domain name.
      /^[a-z][a-z0-9+-]*(?:\.[a-z0-9+-]+)+:$/.test(url.protocol)
    );
  } catch {
    return false;
  }
}

const redirectUri = z.string().min(1).max(4096).refine(isSafeRedirect);
export const registration = z.object({
  client_name: z.string().trim().min(1).max(200).default("MCP Client"),
  redirect_uris: z.array(redirectUri).min(1).max(20),
  token_endpoint_auth_method: z.enum(authMethods).default("client_secret_basic"),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
  response_types: z.array(z.literal("code")).optional(),
  scope: z.literal("mcp").optional(),
});

export const authorization = z.object({
  client_id: z.string().uuid(),
  redirect_uri: redirectUri,
  response_type: z.literal("code"),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
  state: z.string().max(4096).optional(),
  resource: z.string().optional(),
  scope: z.literal("mcp").optional(),
});
export type Authorization = z.infer<typeof authorization>;

export function validApproval(params: Authorization, registered: string[], resource: string) {
  return (
    registered.includes(params.redirect_uri) &&
    (params.resource === undefined || params.resource === resource)
  );
}

export function callbackUrl(params: Authorization, result: { code: string } | { error: string }) {
  const url = new URL(params.redirect_uri);
  for (const [k, v] of Object.entries(result)) url.searchParams.set(k, v);
  if (params.state !== undefined) url.searchParams.set("state", params.state);
  return url.toString();
}
