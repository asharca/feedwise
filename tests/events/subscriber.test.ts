import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import { createUserEventSubscriber } from "@/lib/events/subscriber";

class FakeRedis extends EventEmitter {
  subscribe = vi.fn(async (_channel: string) => 1);
  unsubscribe = vi.fn(async (_channel: string) => 0);
}

describe("shared user event subscriber", () => {
  it("subscribes once per user and isolates users and connection lifetimes", () => {
    const redis = new FakeRedis();
    const connect = vi.fn(() => redis);
    const subscribe = createUserEventSubscriber(connect);
    const a = vi.fn(),
      b = vi.fn(),
      c = vi.fn();
    const closeA = subscribe("1", a),
      closeB = subscribe("1", b),
      closeC = subscribe("2", c);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(redis.subscribe.mock.calls).toEqual([["feedwise:events:1"], ["feedwise:events:2"]]);
    redis.emit("message", "feedwise:events:1", "first");
    expect(a).toHaveBeenCalledWith("first");
    expect(b).toHaveBeenCalledWith("first");
    expect(c).not.toHaveBeenCalled();
    closeA();
    closeA();
    expect(redis.unsubscribe).not.toHaveBeenCalled();
    redis.emit("message", "feedwise:events:1", "second");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    closeC();
    closeB();
    expect(redis.unsubscribe.mock.calls).toEqual([["feedwise:events:2"], ["feedwise:events:1"]]);
    redis.emit("message", "feedwise:events:1", "late");
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("resubscribes after the final listener leaves even before Redis acknowledges", async () => {
    const redis = new FakeRedis();
    const { promise, reject } = Promise.withResolvers<number>();
    redis.subscribe.mockReturnValueOnce(promise);
    const subscribe = createUserEventSubscriber(() => redis);
    const listener = vi.fn();
    const onError = vi.fn();
    subscribe("user", listener, onError)();
    const close = subscribe("user", listener, onError);
    reject(new Error("stale"));
    await Promise.resolve();
    redis.emit("message", "feedwise:events:user", "new");
    expect(redis.subscribe).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith("new");
    expect(onError).not.toHaveBeenCalled();
    close();
  });
});
