import IORedis from "ioredis";
import type { FeedwiseEvent } from "./types";

let _pub: IORedis | null = null;

function getPub(): IORedis {
  if (!_pub) {
    _pub = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return _pub;
}

export async function publishEvent(userId: string, event: FeedwiseEvent): Promise<void> {
  try {
    await getPub().publish(`feedwise:events:${userId}`, JSON.stringify(event));
  } catch (err) {
    console.error("[events/publisher] Failed to publish event:", err);
  }
}
