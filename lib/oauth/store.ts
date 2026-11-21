import IORedis from "ioredis";
import {
  ACCESS_TTL,
  REFRESH_TTL,
  digest,
  type AuthCode,
  type Grant,
  type OAuthClient,
  type TokenStore,
} from "./tokens";

let redis: IORedis | undefined;
function connection() {
  return (redis ??= new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379"));
}
// Do not trust registrations made by the old implicit-registration approval flow.
const prefix = "oauth:v2:";
const key = (kind: string, value: string) => `${prefix}${kind}:${digest(value)}`;

export async function saveClient(client: OAuthClient) {
  await connection().set(
    key("client", client.client_id),
    JSON.stringify(client),
    "EX",
    REFRESH_TTL,
  );
}
export async function getClient(id: string): Promise<OAuthClient | null> {
  const raw = await connection().getex(key("client", id), "EX", REFRESH_TTL);
  return raw ? JSON.parse(raw) : null;
}
export async function saveAuthCode(code: string, grant: AuthCode) {
  await connection().set(key("code", code), JSON.stringify(grant), "EX", 300);
}

// A spent refresh handle retains its family pointer until expiry. Reusing it
// revokes the whole family instead of allowing two independent descendants.
interface FamilyGrant extends Grant {
  family: string;
}
const rotateScript = `
  local old = redis.call('GET', KEYS[1])
  if not old then return 0 end
  local grant = cjson.decode(old)
  if grant.clientId ~= ARGV[1] or grant.resource ~= ARGV[2] then return 0 end
  if redis.call('GET', grant.family) ~= KEYS[1] then
    redis.call('DEL', grant.family)
    return 0
  end
  redis.call('SET', grant.family, KEYS[2], 'EX', ARGV[3])
  redis.call('SET', KEYS[2], old, 'EX', ARGV[3])
  redis.call('SET', KEYS[3], old, 'EX', ARGV[4])
  return 1`;

export const tokenStore: TokenStore = {
  getClient,
  async getCode(code) {
    const raw = await connection().get(key("code", code));
    return raw ? JSON.parse(raw) : null;
  },
  async consumeCode(code) {
    return (await connection().del(key("code", code))) === 1;
  },
  async issue(grant, access, refresh) {
    const family = key("family", refresh);
    const record = JSON.stringify({ ...grant, family });
    const refreshKey = key("refresh", refresh);
    await connection()
      .multi()
      .set(family, refreshKey, "EX", REFRESH_TTL)
      .set(refreshKey, record, "EX", REFRESH_TTL)
      .set(key("access", access), record, "EX", ACCESS_TTL)
      .exec();
  },
  async rotate(client, resource, old, access, refresh) {
    return (
      (await connection().eval(
        rotateScript,
        3,
        key("refresh", old),
        key("refresh", refresh),
        key("access", access),
        client,
        resource,
        REFRESH_TTL,
        ACCESS_TTL,
      )) === 1
    );
  },
};

export async function accessGrant(token: string, resource: string): Promise<Grant | null> {
  const raw = await connection().get(key("access", token));
  if (!raw) return null;
  const grant: FamilyGrant = JSON.parse(raw);
  return grant.resource === resource && (await connection().exists(grant.family)) ? grant : null;
}
