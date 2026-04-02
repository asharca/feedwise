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
