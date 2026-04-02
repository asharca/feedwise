import IORedis from "ioredis";

const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const PREFIX = "oauth:";
const CLIENT_TTL = 86400 * 30; // 30 days
const CODE_TTL = 300; // 5 minutes

export interface OAuthClient {
  client_id: string;
  client_secret: string;
  client_name: string;
  redirect_uris: string[];
}

export interface AuthCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

// ─── Client Registration ──────────────────────────────────────

export async function saveClient(client: OAuthClient): Promise<void> {
  await redis.set(
    `${PREFIX}client:${client.client_id}`,
    JSON.stringify(client),
    "EX",
    CLIENT_TTL
  );
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const raw = await redis.get(`${PREFIX}client:${clientId}`);
  return raw ? (JSON.parse(raw) as OAuthClient) : null;
}

// ─── Authorization Codes ──────────────────────────────────────

export async function saveAuthCode(data: AuthCode): Promise<void> {
  await redis.set(
    `${PREFIX}code:${data.code}`,
    JSON.stringify(data),
    "EX",
    CODE_TTL
  );
}

export async function consumeAuthCode(code: string): Promise<AuthCode | null> {
  const key = `${PREFIX}code:${code}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as AuthCode;
}
