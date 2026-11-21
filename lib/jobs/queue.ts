import { Queue } from "bullmq";
import IORedis from "ioredis";

let _connection: IORedis | null = null;
export function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

const queues = new Map<string, Queue>();

export function getJobQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: getConnection() });
    queues.set(name, queue);
  }
  return queue;
}

export const getFeedFetchQueue = () => getJobQueue("feed.fetch");
export const getHotFetchQueue = () => getJobQueue("hot.fetch");
export const getMaintenanceQueue = () => getJobQueue("maintenance");

/** Call after workers have drained: active jobs may still enqueue more work. */
export async function closeJobQueues() {
  const results = await Promise.allSettled(Array.from(queues.values(), (queue) => queue.close()));
  queues.clear();
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
  for (const result of results) if (result.status === "rejected") throw result.reason;
}

export function enqueueHotFetch(key: string) {
  return getHotFetchQueue().add(
    "fetch",
    { key },
    {
      jobId: `hot-${key}`,
      // Failed sources are retried by the scheduler with source-level backoff.
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
