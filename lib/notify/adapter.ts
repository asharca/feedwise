import { z } from "zod";
import { assertFetchableUrl, readLimitedText, safeFetch } from "@/lib/net/safe-fetch";
import type { SafeFetchOptions } from "@/lib/net/safe-fetch";
import type { NotifyMessage } from "./message";

export const endpoint = z
  .string()
  .max(8192)
  .refine((value) => {
    try {
      assertFetchableUrl(value);
      return true;
    } catch {
      return false;
    }
  }, "地址必须是可访问的 HTTP(S) URL");
export const required = z.string().min(1).max(4096);
export const optionalSecret = z.string().max(4096).optional();
export type DeliveryContext = { userId?: string; fetch?: typeof safeFetch };

export function defineChannel<S extends z.ZodType>(
  schema: S,
  deliver: (config: z.output<S>, message: NotifyMessage, ctx: DeliveryContext) => Promise<void>,
) {
  return {
    schema,
    send: (config: Record<string, string>, message: NotifyMessage, ctx: DeliveryContext = {}) =>
      deliver(schema.parse(config), message, ctx),
  };
}

/** Only messages we create may be persisted or returned: vendor errors can contain credentials. */
export class DeliveryError extends Error {}
export function deliveryError(error: unknown) {
  return error instanceof DeliveryError ? error.message : "通知发送失败，请检查渠道配置和网络连接";
}

export async function request(ctx: DeliveryContext, url: string | URL, init: SafeFetchOptions) {
  // Never forward a signed payload, token or VAPID Authorization header to a redirect target.
  return (ctx.fetch ?? safeFetch)(url, { ...init, method: "POST", maxRedirects: 0 });
}
export async function checkResponse(res: Awaited<ReturnType<typeof safeFetch>>) {
  await res.body?.cancel();
  if (!res.ok) throw new DeliveryError(`通知服务返回 HTTP ${res.status}`);
}

export async function postJson(
  ctx: DeliveryContext,
  url: string | URL,
  payload: object,
  check?: (data: Record<string, unknown>) => boolean,
) {
  const res = await request(ctx, url, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !check) return checkResponse(res);
  const data = JSON.parse(await readLimitedText(res, 32 * 1024));
  if (!data || !check(data)) throw new DeliveryError("通知服务未接受此消息");
}
