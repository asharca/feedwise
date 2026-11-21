import { z } from "zod";
import { defineChannel, endpoint, postJson, required } from "../adapter";

export const bark = defineChannel(
  z.strictObject({ serverUrl: endpoint.default("https://api.day.app"), deviceKey: required }),
  async ({ serverUrl, deviceKey }, { title, body, url }, ctx) => {
    await postJson(
      ctx,
      `${serverUrl.replace(/\/$/, "")}/push`,
      { device_key: deviceKey, title, body, url },
      (data) => data.code === 200,
    );
  },
);
