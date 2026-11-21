import { describe, expect, it } from "vitest";
import {
  serializePushSubscription,
  shouldRegisterServiceWorker,
  uint8ArrayToBase64Url,
  urlBase64ToUint8Array,
} from "@/lib/push/client";

describe("urlBase64ToUint8Array / uint8ArrayToBase64Url", () => {
  it("round-trips arbitrary bytes including URL-safe characters (- and _)", () => {
    const sample = new Uint8Array([0, 1, 2, 62, 63, 127, 128, 251, 254, 255]);
    const encoded = uint8ArrayToBase64Url(sample);
    expect(encoded).not.toMatch(/[+/=]/);

    const decoded = urlBase64ToUint8Array(encoded);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(decoded)).toEqual(Array.from(sample));
  });

  it("handles unpadded VAPID-like 65-byte keys with surrounding whitespace", () => {
    const bytes = new Uint8Array(65);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 3) % 256;
    const vapidKey = `  ${uint8ArrayToBase64Url(bytes)}\n`;
    const decoded = urlBase64ToUint8Array(vapidKey);
    expect(decoded.length).toBe(65);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});

describe("serializePushSubscription", () => {
  it("extracts endpoint and keys from toJSON()", () => {
    const sub = {
      endpoint: "https://push.example/sub/1",
      toJSON: () => ({
        endpoint: "https://push.example/sub/1",
        keys: { p256dh: "abc_123", auth: "xyz-789" },
      }),
    };
    expect(serializePushSubscription(sub)).toEqual({
      endpoint: "https://push.example/sub/1",
      keys: { p256dh: "abc_123", auth: "xyz-789" },
    });
  });

  it("falls back to getKey() ArrayBuffers when toJSON() omits keys", () => {
    const p256dhBytes = new Uint8Array([10, 20, 30, 40]);
    const authBytes = new Uint8Array([50, 60, 70, 80]);
    const sub = {
      endpoint: "https://push.example/sub/2",
      toJSON: () => ({ endpoint: "https://push.example/sub/2" }),
      getKey: (name: "p256dh" | "auth") =>
        name === "p256dh" ? p256dhBytes.buffer : authBytes.buffer,
    };

    const result = serializePushSubscription(sub);
    expect(result.endpoint).toBe("https://push.example/sub/2");
    expect(Array.from(urlBase64ToUint8Array(result.keys.p256dh))).toEqual([10, 20, 30, 40]);
    expect(Array.from(urlBase64ToUint8Array(result.keys.auth))).toEqual([50, 60, 70, 80]);
  });

  it("throws when endpoint or keys are missing", () => {
    expect(() =>
      serializePushSubscription({
        endpoint: "https://push.example/sub/3",
        toJSON: () => ({ endpoint: "https://push.example/sub/3", keys: {} }),
      }),
    ).toThrow("推送订阅信息不完整");
  });
});

describe("shouldRegisterServiceWorker", () => {
  it("registers in production by default", () => {
    expect(shouldRegisterServiceWorker({ nodeEnv: "production" })).toBe(true);
  });

  it("skips in development unless explicitly enabled", () => {
    expect(shouldRegisterServiceWorker({ nodeEnv: "development" })).toBe(false);
    expect(shouldRegisterServiceWorker({ nodeEnv: "development", enableDevSw: "0" })).toBe(false);
    expect(shouldRegisterServiceWorker({ nodeEnv: "development", enableDevSw: "1" })).toBe(true);
    expect(shouldRegisterServiceWorker({ nodeEnv: "development", enableDevSw: "true" })).toBe(true);
  });
});
