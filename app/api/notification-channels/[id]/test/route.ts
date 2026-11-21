import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { getChannel, recordDelivery } from "@/lib/db/queries/notification-channels";
import { sendToChannel } from "@/lib/notify/send";
import { deliveryError } from "@/lib/notify/adapter";

export const POST = withAuth(async (_req, { user }, ctx) => {
  const id = z.uuid().parse((await ctx.params).id);
  const row = await getChannel(user.id, id);
  if (!row) return Response.json({ success: false, error: "通知渠道不存在" }, { status: 404 });
  try {
    await sendToChannel(row, {
      title: "Feedwise 测试通知",
      body: "通知渠道连接正常。",
      source: "Feedwise",
    });
  } catch (error) {
    const reason = deliveryError(error);
    await recordDelivery(user.id, id, reason);
    return Response.json({ success: false, error: reason }, { status: 502 });
  }
  await recordDelivery(user.id, id, null);
  return Response.json({ success: true, data: { ok: true } });
});
