/**
 * Integration test: register → sign-in → get session
 * Requires dev server running on http://localhost:3000
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:3000";
const TEST_EMAIL = `test-${Date.now()}@feedwise.local`;
const TEST_PASSWORD = "testpassword123";
const TEST_NAME = "Test User";

function authHeaders(extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    Origin: BASE,
    ...extra,
  };
}

describe("auth flow", () => {
  let sessionCookie = "";

  beforeAll(async () => {
    // Ensure server is reachable
    const probe = await fetch(`${BASE}/api/auth/get-session`).catch(() => null);
    if (!probe) throw new Error("Dev server not running on localhost:3000");
  });

  it("registers a new user", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: TEST_NAME,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(TEST_EMAIL);
    expect(data.user.name).toBe(TEST_NAME);
  });

  it("signs in with correct credentials", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(TEST_EMAIL);

    // Capture session cookie for next test
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    sessionCookie = setCookie!.split(";")[0];
  });

  it("rejects wrong password", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: "wrongpassword",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("returns session for authenticated user", async () => {
    const res = await fetch(`${BASE}/api/auth/get-session`, {
      headers: authHeaders({ Cookie: sessionCookie }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe(TEST_EMAIL);
  });

  it("returns null session for unauthenticated request", async () => {
    const res = await fetch(`${BASE}/api/auth/get-session`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeNull();
  });
});
