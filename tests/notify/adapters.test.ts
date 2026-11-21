// @vitest-environment node
import { createHmac } from "node:crypto";
import { Response } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { channels } from "@/lib/notify/channels";
import { deliveryError } from "@/lib/notify/adapter";
import type { safeFetch } from "@/lib/net/safe-fetch";

const message = { title: "消息", body: "body", url: "https://news.example/item", source: "test" };
const url = "https://hooks.example/bot?token=keep";
const text = `消息\nbody\n${message.url}`;
const now = new Date("2026-01-01T00:00:00Z");
function transport(reply: object, status = 200) {
  const fetch = vi.fn<typeof safeFetch>(
    async () => new Response(JSON.stringify(reply), { status }),
  );
  return {
    ctx: { fetch },
    sent() {
      expect(fetch).toHaveBeenCalledTimes(1);
      const [address, options] = fetch.mock.calls[0];
      expect(options).toMatchObject({ method: "POST", maxRedirects: 0 });
      return { url: String(address), body: String(options?.body), headers: options?.headers };
    },
  };
}
afterEach(() => vi.useRealTimers());

describe("outbound notification requests", () => {
  it("webhook signs the exact UTF-8 JSON payload and timestamp", async () => {
    vi.useFakeTimers().setSystemTime(now);
    const t = transport({});
    await channels.webhook.send({ url, secret: "k" }, message, t.ctx);
    const req = t.sent();
    expect(req.url).toBe(url);
    expect(JSON.parse(req.body)).toEqual({ ...message, sentAt: now.toISOString() });
    expect(req.headers).toMatchObject({
      "X-Feedwise-Signature": createHmac("sha256", "k").update(req.body).digest("hex"),
    });
  });
  it("telegram uses sendMessage and keeps link previews enabled", async () => {
    const t = transport({ ok: true });
    await channels.telegram.send({ botToken: "123:token", chatId: "chat" }, message, t.ctx);
    const req = t.sent();
    expect(req.url).toBe("https://api.telegram.org/bot123:token/sendMessage");
    expect(JSON.parse(req.body)).toEqual({
      chat_id: "chat",
      text,
      disable_web_page_preview: false,
    });
  });
  it("bark sends device key and click-through URL in the JSON body", async () => {
    const t = transport({ code: 200 });
    await channels.bark.send({ deviceKey: "device" }, message, t.ctx);
    const req = t.sent();
    expect(req.url).toBe("https://api.day.app/push");
    expect(JSON.parse(req.body)).toEqual({
      device_key: "device",
      title: "消息",
      body: "body",
      url: message.url,
    });
  });
  it("ntfy posts the text body, including a safe UTF-8 Title and optional bearer", async () => {
    const t = transport({});
    await channels.ntfy.send({ topic: "feed", token: "abc" }, message, t.ctx);
    expect(t.sent()).toEqual({
      url: "https://ntfy.sh/feed",
      body: "body",
      headers: {
        Title: `=?UTF-8?B?${Buffer.from("消息").toString("base64")}?=`,
        Click: message.url,
        Authorization: "Bearer abc",
      },
    });
  });
  it("signs Feishu using seconds, empty HMAC input, compound key", async () => {
    vi.useFakeTimers().setSystemTime(now);
    const t = transport({ code: 0 });
    await channels.feishu.send({ webhookUrl: url, secret: "key" }, message, t.ctx);
    const timestamp = String(now.valueOf() / 1000);
    const req = t.sent();
    expect(req.url).toBe(url);
    expect(JSON.parse(req.body)).toEqual({
      msg_type: "text",
      content: { text },
      timestamp,
      sign: createHmac("sha256", `${timestamp}\nkey`).digest("base64"),
    });
  });
  it("signs DingTalk using milliseconds and preserves the original token query", async () => {
    vi.useFakeTimers().setSystemTime(now);
    const t = transport({ errcode: 0 });
    await channels.dingtalk.send({ webhookUrl: url, secret: "key" }, message, t.ctx);
    const req = t.sent();
    expect(Object.fromEntries(new URL(req.url).searchParams)).toEqual({
      token: "keep",
      timestamp: String(now.valueOf()),
      sign: createHmac("sha256", "key").update(`${now.valueOf()}\nkey`).digest("base64"),
    });
    expect(JSON.parse(req.body)).toEqual({ msgtype: "text", text: { content: text } });
  });
  it("WeCom sends the text envelope", async () => {
    const t = transport({ errcode: 0 });
    await channels.wecom.send({ webhookUrl: url }, message, t.ctx);
    const req = t.sent();
    expect(req.url).toBe(url);
    expect(JSON.parse(req.body)).toEqual({ msgtype: "text", text: { content: text } });
  });
  it("rejects non-success HTTP and vendor codes without surfacing secret response bodies", async () => {
    await expect(
      channels.webhook.send({ url }, message, transport({ error: url }, 403).ctx),
    ).rejects.toThrow("HTTP 403");
    await expect(
      channels.wecom.send(
        { webhookUrl: url },
        message,
        transport({ errcode: -1, errmsg: url }).ctx,
      ),
    ).rejects.toThrow("未接受");
    expect(deliveryError(new Error(url))).not.toContain(url);
  });
});
