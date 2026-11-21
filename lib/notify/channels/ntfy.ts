import { z } from "zod";
import { checkResponse, defineChannel, endpoint, optionalSecret, request } from "../adapter";

export const ntfy = defineChannel(
  z.strictObject({
    serverUrl: endpoint.default("https://ntfy.sh"),
    topic: z.string().regex(/^[A-Za-z0-9_-]+$/),
    token: optionalSecret,
  }),
  async ({ serverUrl, topic, token }, message, ctx) => {
    // ntfy accepts RFC 2047 encoded titles; HTTP header values cannot carry arbitrary UTF-8.
    const title = /^[\x20-\x7e]*$/.test(message.title)
      ? message.title
      : `=?UTF-8?B?${Buffer.from(message.title).toString("base64")}?=`;
    const headers: Record<string, string> = { Title: title };
    if (message.url) headers.Click = encodeURI(message.url).replace(/%25([a-f0-9]{2})/gi, "%$1");
    if (token) headers.Authorization = `Bearer ${token}`;
    await checkResponse(
      await request(ctx, `${serverUrl.replace(/\/$/, "")}/${topic}`, {
        body: message.body,
        headers,
      }),
    );
  },
);
