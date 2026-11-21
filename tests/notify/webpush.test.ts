// @vitest-environment node
import { createECDH, randomBytes } from "node:crypto";
import { generateVAPIDKeys } from "web-push";
import { Response } from "undici";
import { afterEach, expect, it, vi } from "vitest";
import { removeSubscription, subscriptionsForUser } from "@/lib/db/queries/push";
import { webpush } from "@/lib/notify/channels/webpush";
import type { safeFetch } from "@/lib/net/safe-fetch";

vi.mock("@/lib/db/queries/push", () => ({
  subscriptionsForUser: vi.fn(),
  removeSubscription: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("uses encrypted aes128gcm and VAPID through safeFetch for every subscription, pruning only 404/410", async () => {
  const vapid = generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:admin@example.org");
  const client = createECDH("prime256v1");
  const keys = {
    p256dh: client.generateKeys().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
  const statuses = [201, 404, 410, 503];
  const subs = statuses.map((status) => ({ endpoint: `https://push.example/${status}`, keys }));
  vi.mocked(subscriptionsForUser).mockResolvedValue(subs);
  const fetch = vi.fn<typeof safeFetch>(
    async (address) => new Response(null, { status: Number(new URL(address).pathname.slice(1)) }),
  );
  await expect(
    webpush.send(
      {},
      { title: "secret-title", body: "body", url: "https://app.example/reader", source: "tag" },
      { userId: "u", fetch },
    ),
  ).rejects.toThrow("部分浏览器推送发送失败");
  expect(subscriptionsForUser).toHaveBeenCalledWith("u");
  expect(fetch).toHaveBeenCalledTimes(4);
  for (const [address, init] of fetch.mock.calls) {
    expect(subs.some((sub) => sub.endpoint === address)).toBe(true);
    expect(init).toMatchObject({
      method: "POST",
      maxRedirects: 0,
      headers: { "Content-Encoding": "aes128gcm", Authorization: expect.stringMatching(/^vapid /) },
    });
    expect(Buffer.isBuffer(init?.body)).toBe(true);
    expect((init?.body as Buffer).includes("secret-title")).toBe(false);
  }
  expect(vi.mocked(removeSubscription).mock.calls).toEqual([
    ["u", subs[1].endpoint],
    ["u", subs[2].endpoint],
  ]);
});

it("fails before network I/O when VAPID is not configured", async () => {
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  const fetch = vi.fn<typeof safeFetch>();
  await expect(webpush.send({}, { title: "t", body: "b" }, { userId: "u", fetch })).rejects.toThrow(
    "Web Push 未配置",
  );
  expect(fetch).not.toHaveBeenCalled();
});
