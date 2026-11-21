import IORedis from "ioredis";
import { userEventsChannel } from "./publisher";

type Listener = (message: string) => void;
interface RedisSubscriber {
  on(event: "message", handler: (channel: string, message: string) => void): unknown;
  on(event: "error", handler: (error: Error) => void): unknown;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
}

type Subscription = { listener: Listener; onError?: (error: unknown) => void };

export function createUserEventSubscriber(connect: () => RedisSubscriber) {
  const channels = new Map<string, Set<Subscription>>();
  let redis: RedisSubscriber;

  return (userId: string, listener: Listener, onError?: Subscription["onError"]) => {
    if (!redis) {
      redis = connect();
      redis.on("error", (err) => console.error("[sse] Redis error:", err));
      redis.on("message", (channel, message) => {
        for (const sub of channels.get(channel) ?? []) {
          try {
            sub.listener(message);
          } catch (err) {
            console.error("[sse] Listener error:", err);
          }
        }
      });
    }
    const channel = userEventsChannel(userId);
    const existing = channels.get(channel);
    const group = existing ?? new Set<Subscription>();
    if (!existing) {
      channels.set(channel, group);
      // Issue Redis commands synchronously, in the same order as local
      // refcount transitions, even if a client cancels before subscribe ACK.
      void redis.subscribe(channel).catch((err) => {
        if (channels.get(channel) !== group) return;
        channels.delete(channel);
        console.error("[sse] Subscription failed:", err);
        for (const sub of group) sub.onError?.(err);
      });
    }
    const sub = { listener, onError };
    group.add(sub);
    return () => {
      if (!group.delete(sub) || group.size || channels.get(channel) !== group) return;
      channels.delete(channel);
      void redis
        .unsubscribe(channel)
        .catch((err) => console.error("[sse] Unsubscribe failed:", err));
    };
  };
}

export const subscribeUserEvents = createUserEventSubscriber(
  () =>
    new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null }),
);
