// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { NotifyJob } from "@/lib/notify/message";
import type { ChannelRow } from "@/lib/notify/config";
import { getChannel, recordDelivery } from "@/lib/db/queries/notification-channels";
import { sendToChannel } from "@/lib/notify/send";
import { enqueueNotification } from "@/lib/jobs/queues/notify";
import { startNotifyWorker } from "@/lib/jobs/workers/notify-worker";

type TestJob = { data: NotifyJob; opts: { attempts: number }; attemptsMade: number };
const { add, capture } = vi.hoisted(() => ({
  add: vi.fn(),
  capture: vi.fn<(name: string, run: (job: TestJob) => Promise<void>, opts: object) => void>(),
}));
vi.mock("bullmq", () => ({
  Worker: class {
    constructor(...args: Parameters<typeof capture>) {
      capture(...args);
    }
  },
}));
vi.mock("@/lib/jobs/queue", () => ({ getConnection: () => ({}), getJobQueue: () => ({ add }) }));
vi.mock("@/lib/db/queries/notification-channels", () => ({
  getChannel: vi.fn(),
  recordDelivery: vi.fn(),
}));
vi.mock("@/lib/notify/send", () => ({ sendToChannel: vi.fn() }));
const data = { userId: "u", channelId: "c", message: { title: "t", body: "b" } };
const channel: ChannelRow = {
  userId: "u",
  id: "c",
  enabled: true,
  config: null,
  type: "webpush",
  name: "c",
  lastError: null,
  lastSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const job = { data, opts: { attempts: 3 }, attemptsMade: 0 };
function worker() {
  startNotifyWorker();
  const [[name, run, opts]] = capture.mock.calls;
  expect(name).toBe("notify.send");
  expect(opts).toMatchObject({ concurrency: 5 });
  return run;
}
beforeEach(() => vi.resetAllMocks());

it("enqueues a retryable send with exponential backoff", async () => {
  await enqueueNotification(data);
  expect(add).toHaveBeenCalledWith(
    "send",
    data,
    expect.objectContaining({
      attempts: 3,
      backoff: { type: "exponential", delay: expect.any(Number) },
    }),
  );
});
it("skips deleted and disabled channels and looks them up by owner", async () => {
  const run = worker();
  await run(job);
  vi.mocked(getChannel).mockResolvedValue({ ...channel, enabled: false });
  await run(job);
  expect(getChannel).toHaveBeenCalledWith("u", "c");
  expect(sendToChannel).not.toHaveBeenCalled();
  expect(recordDelivery).not.toHaveBeenCalled();
});
it("persists a successful send", async () => {
  const run = worker();
  vi.mocked(getChannel).mockResolvedValue(channel);
  await run(job);
  expect(sendToChannel).toHaveBeenCalledWith(channel, data.message);
  expect(recordDelivery).toHaveBeenCalledWith("u", "c", null);
});
it("rethrows for retry but only persists a sanitized error on the final failure", async () => {
  const run = worker();
  vi.mocked(getChannel).mockResolvedValue(channel);
  vi.mocked(sendToChannel).mockRejectedValue(new Error("private URL should not escape"));
  await expect(run(job)).rejects.toThrow("通知发送失败");
  expect(recordDelivery).not.toHaveBeenCalled();
  await expect(run({ ...job, attemptsMade: 2 })).rejects.toThrow("通知发送失败");
  expect(recordDelivery).toHaveBeenCalledWith("u", "c", expect.not.stringContaining("private URL"));
});
