import { z } from "zod";
import { defineChannel, postJson, required } from "../adapter";
import { formatText } from "../message";

export const telegram = defineChannel(
  z.strictObject({ botToken: required.regex(/^[A-Za-z0-9:_-]+$/), chatId: required }),
  async ({ botToken, chatId }, message, ctx) => {
    await postJson(
      ctx,
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text: formatText(message),
        disable_web_page_preview: false,
      },
      (data) => data.ok === true,
    );
  },
);
