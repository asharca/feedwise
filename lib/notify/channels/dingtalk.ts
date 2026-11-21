import { createHmac } from "node:crypto";
import { z } from "zod";
import { defineChannel, endpoint, optionalSecret, postJson } from "../adapter";
import { formatText } from "../message";

export const dingtalk = defineChannel(
  z.strictObject({ webhookUrl: endpoint, secret: optionalSecret }),
  async ({ webhookUrl, secret }, message, ctx) => {
    const url = new URL(webhookUrl);
    if (secret) {
      const timestamp = String(Date.now());
      url.searchParams.set("timestamp", timestamp);
      url.searchParams.set(
        "sign",
        createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64"),
      );
    }
    await postJson(
      ctx,
      url,
      { msgtype: "text", text: { content: formatText(message) } },
      (data) => data.errcode === 0,
    );
  },
);
