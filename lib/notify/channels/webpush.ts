import { generateRequestDetails } from "web-push";
import { z } from "zod";
import { removeSubscription, subscriptionsForUser } from "@/lib/db/queries/push";
import { checkResponse, defineChannel, DeliveryError, request } from "../adapter";
import { vapidDetails } from "../vapid";

export const webpush = defineChannel(
  z.strictObject({}),
  async (_config, { title, body, url, source: tag }, ctx) => {
    if (!ctx.userId) throw new DeliveryError("缺少推送用户");
    const vapid = vapidDetails();
    if (!vapid) throw new DeliveryError("Web Push 未配置");
    const userId = ctx.userId;
    const subs = await subscriptionsForUser(userId);
    if (!subs.length) throw new DeliveryError("尚未订阅浏览器推送");
    const payload = JSON.stringify({ title, body, url, tag });
    let failed = false;
    for (const sub of subs) {
      try {
        // web-push builds the VAPID headers and encrypts; safeFetch owns the transport.
        const req = generateRequestDetails(sub, payload, { vapidDetails: vapid });
        const res = await request(ctx, req.endpoint, { body: req.body, headers: req.headers });
        if (res.status === 404 || res.status === 410) {
          await res.body?.cancel();
          await removeSubscription(userId, sub.endpoint);
        } else await checkResponse(res);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new DeliveryError("部分浏览器推送发送失败");
  },
);
