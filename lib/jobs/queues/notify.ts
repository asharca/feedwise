import { getJobQueue } from "@/lib/jobs/queue";
import type { NotifyJob } from "@/lib/notify/message";

export type { NotifyJob, NotifyMessage } from "@/lib/notify/message";
export const NOTIFY_QUEUE = "notify.send";

export async function enqueueNotification(job: NotifyJob): Promise<void> {
  await getJobQueue(NOTIFY_QUEUE).add("send", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
