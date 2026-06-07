import IORedis from "ioredis";
import type { FeedwiseEvent } from "./types";

const pub = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export async function publishEvent(userId: string, event: FeedwiseEvent): Promise<void> {
  try {
    await pub.publish(`feedwise:events:${userId}`, JSON.stringify(event));
  } catch (err) {
    console.error("[events/publisher] Failed to publish event:", err);
  }
}
