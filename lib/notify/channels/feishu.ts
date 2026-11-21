import { createHmac } from "node:crypto";
import { z } from "zod";
import { defineChannel, endpoint, optionalSecret, postJson } from "../adapter";
import { formatText } from "../message";

export const feishu = defineChannel(
  z.strictObject({ webhookUrl: endpoint, secret: optionalSecret }),
  async ({ webhookUrl, secret }, message, ctx) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = secret
      ? { timestamp, sign: createHmac("sha256", `${timestamp}\n${secret}`).digest("base64") }
      : {};
    await postJson(
      ctx,
      webhookUrl,
      { msg_type: "text", content: { text: formatText(message) }, ...signature },
      (data) => data.code === 0 || data.StatusCode === 0,
    );
  },
);
