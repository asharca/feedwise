import { z } from "zod";
import { defineChannel, endpoint, postJson } from "../adapter";
import { formatText } from "../message";

export const wecom = defineChannel(
  z.strictObject({ webhookUrl: endpoint }),
  async ({ webhookUrl }, message, ctx) => {
    await postJson(
      ctx,
      webhookUrl,
      { msgtype: "text", text: { content: formatText(message) } },
      (data) => data.errcode === 0,
    );
  },
);
