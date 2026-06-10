// tests/db/account.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state: { updateError: unknown; updatedRow: Record<string, unknown> } = {
    updateError: null,
    updatedRow: { id: "u1", email: "new@e.com", name: "N" },
  };
  const db = {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            if (state.updateError) throw state.updateError;
            return [state.updatedRow];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => [{ id: "u1", email: "a@e.com", name: "N", image: null, createdAt: new Date(), settings: { theme: "dark" } }],
      }),
    }),
  };
  return { db, state };
});

vi.mock("@/lib/db", () => ({ db: h.db }));

import { updateAccount, getAccount, getUserSettings } from "@/lib/db/queries/account";

beforeEach(() => {
  h.state.updateError = null;
});

describe("updateAccount", () => {
  it("returns ok with the updated row", async () => {
    const out = await updateAccount("u1", { email: "new@e.com" });
    expect(out).toEqual({ ok: true, account: h.state.updatedRow });
  });

  it("maps a unique violation to email-taken instead of throwing", async () => {
    h.state.updateError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const out = await updateAccount("u1", { email: "taken@e.com" });
    expect(out).toEqual({ ok: false, reason: "email-taken" });
  });

  it("detects unique violations wrapped in a cause", async () => {
    h.state.updateError = Object.assign(new Error("query failed"), {
      cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
    });
    const out = await updateAccount("u1", { email: "taken@e.com" });
    expect(out).toEqual({ ok: false, reason: "email-taken" });
  });

  it("rethrows other errors", async () => {
    h.state.updateError = new Error("connection lost");
    await expect(updateAccount("u1", { name: "X" })).rejects.toThrow("connection lost");
  });
});

describe("getAccount / getUserSettings", () => {
  it("returns the account row", async () => {
    const acc = await getAccount("u1");
    expect(acc).toMatchObject({ id: "u1", email: "a@e.com" });
  });

  it("returns settings object", async () => {
    expect(await getUserSettings("u1")).toEqual({ theme: "dark" });
  });
});
