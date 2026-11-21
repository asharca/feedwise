export function oauthOrigin(request: Request) {
  return new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || request.url)
    .origin;
}

export const authMethods = ["client_secret_basic", "client_secret_post", "none"] as const;
export type ClientAuthMethod = (typeof authMethods)[number];

export function authorizationMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: authMethods,
    scopes_supported: ["mcp"],
  };
}

export function resourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  };
}
