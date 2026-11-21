import { ECDH } from "node:crypto";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { removeSubscription, saveSubscription } from "@/lib/db/queries/push";
import { endpoint } from "@/lib/notify/adapter";

const address = z.object({
  endpoint: endpoint.refine((v) => /^https:\/\//i.test(v), "浏览器推送地址必须使用 HTTPS"),
});
const key = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/);
const input = address.extend({
  keys: z.object({
    auth: key.refine((v) => Buffer.from(v, "base64url").length === 16, "无效的 auth 密钥"),
    p256dh: key.refine((v) => {
      const bytes = Buffer.from(v, "base64url");
      if (bytes.length !== 65 || bytes[0] !== 4) return false;
      try {
        ECDH.convertKey(bytes, "prime256v1");
        return true;
      } catch {
        return false;
      }
    }, "无效的 P-256 公钥"),
  }),
});

export const POST = withAuth(async (req, { user }) => {
  const { endpoint, keys } = input.parse(await req.json().catch(() => null));
  const row = await saveSubscription(user.id, endpoint, keys, req.headers.get("user-agent"));
  if (!row)
    return Response.json({ success: false, error: "此推送订阅已绑定其他账户" }, { status: 409 });
  return Response.json({ success: true, data: row });
});

export const DELETE = withAuth(async (req, { user }) => {
  const { endpoint } = address.parse(await req.json().catch(() => null));
  await removeSubscription(user.id, endpoint);
  return Response.json({ success: true, data: { ok: true } });
});
