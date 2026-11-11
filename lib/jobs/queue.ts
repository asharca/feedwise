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

let _feedFetchQueue: Queue | null = null;
export function getFeedFetchQueue(): Queue {
  if (!_feedFetchQueue) {
    _feedFetchQueue = new Queue("feed.fetch", { connection: getConnection() });
  }
  return _feedFetchQueue;
}

let _hotFetchQueue: Queue | null = null;
export function getHotFetchQueue(): Queue {
  if (!_hotFetchQueue) {
    _hotFetchQueue = new Queue("hot.fetch", { connection: getConnection() });
  }
  return _hotFetchQueue;
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
