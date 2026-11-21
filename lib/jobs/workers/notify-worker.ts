import { Worker } from "bullmq";
import { getConnection } from "@/lib/jobs/queue";
import { NOTIFY_QUEUE, type NotifyJob } from "@/lib/jobs/queues/notify";
import { getChannel, recordDelivery } from "@/lib/db/queries/notification-channels";
import { deliveryError } from "@/lib/notify/adapter";
import { sendToChannel } from "@/lib/notify/send";

export function startNotifyWorker(): Worker {
  return new Worker<NotifyJob>(
    NOTIFY_QUEUE,
    async (job) => {
      const { channelId, userId, message } = job.data;
      const channel = await getChannel(userId, channelId);
      if (!channel?.enabled) return;
      try {
        await sendToChannel(channel, message);
      } catch (error) {
        const reason = deliveryError(error);
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1))
          await recordDelivery(userId, channelId, reason);
        throw new Error(reason);
      }
      await recordDelivery(userId, channelId, null);
    },
    { connection: getConnection(), concurrency: 5 },
  );
}
