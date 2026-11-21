import { createHmac } from "node:crypto";
import { z } from "zod";
import { checkResponse, defineChannel, endpoint, optionalSecret, request } from "../adapter";

export const webhook = defineChannel(
  z.strictObject({ url: endpoint, secret: optionalSecret }),
  async ({ url, secret }, message, ctx) => {
    const body = JSON.stringify({ ...message, sentAt: new Date().toISOString() });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret)
      headers["X-Feedwise-Signature"] = createHmac("sha256", secret).update(body).digest("hex");
    await checkResponse(await request(ctx, url, { body, headers }));
  },
);
