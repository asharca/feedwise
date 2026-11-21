/**
 * Browser-side Web Push and Service Worker helpers.
 * Pure client utilities — no Next.js imports.
 */

export interface SerializedPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushSubscriptionLike {
  endpoint: string;
  toJSON?: () => {
    endpoint?: string;
    keys?: Record<string, string | undefined>;
  };
  getKey?: (name: "p256dh" | "auth") => ArrayBuffer | null;
}

/**
 * Decode a URL-safe base64 string (e.g. a VAPID public key) into a Uint8Array
 * backed by a standard ArrayBuffer, ready for PushManager.subscribe().
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const trimmed = base64String.trim();
  const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/**
 * Encode bytes into unpadded URL-safe base64 (RFC 4648 §5).
 */
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Extract `{ endpoint, keys: { p256dh, auth } }` from a browser PushSubscription.
 * Throws if required fields are missing.
 */
export function serializePushSubscription(
  subscription: PushSubscriptionLike,
): SerializedPushSubscription {
  const json = subscription.toJSON?.();
  const endpoint = (json?.endpoint ?? subscription.endpoint ?? "").trim();
  let p256dh = json?.keys?.p256dh?.trim() ?? "";
  let auth = json?.keys?.auth?.trim() ?? "";

  if (!p256dh && subscription.getKey) {
    const keyBuf = subscription.getKey("p256dh");
    if (keyBuf) p256dh = uint8ArrayToBase64Url(new Uint8Array(keyBuf));
  }
  if (!auth && subscription.getKey) {
    const authBuf = subscription.getKey("auth");
    if (authBuf) auth = uint8ArrayToBase64Url(new Uint8Array(authBuf));
  }

  if (!endpoint || !p256dh || !auth) {
    throw new Error("浏览器返回的推送订阅信息不完整");
  }

  return { endpoint, keys: { p256dh, auth } };
}

/**
 * True when the current browser runtime supports Service Workers, PushManager, and Notifications.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Service Worker is registered in production, or in development when explicitly opted in.
 */
export function shouldRegisterServiceWorker(env: {
  nodeEnv?: string;
  enableDevSw?: string;
}): boolean {
  if (env.nodeEnv === "production") return true;
  const flag = env.enableDevSw?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/**
 * Register the Feedwise Service Worker and wait until it is ready.
 */
export async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("当前浏览器不支持 Service Worker");
  }
  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  return navigator.serviceWorker.ready;
}

/**
 * Inspect the existing PushSubscription on this device (if any) without prompting.
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}
