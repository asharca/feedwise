// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { handleReader } from "@/lib/client-api/greader/router";
import { actionToken } from "@/lib/client-api/credentials";

const { changeItems } = vi.hoisted(() => ({ changeItems: vi.fn() }));
vi.mock("@/lib/db/queries/client-api", () => ({
  readerIdentity: async () => ({ id: "owner", credentialHash: "hash" }),
  changeItems,
}));

beforeEach(() => changeItems.mockClear());

it.each([
  { authorization: true, token: null, status: 200 },
  { authorization: true, token: actionToken("owner", "hash"), status: 200 },
  { authorization: true, token: actionToken("other", "hash"), status: 403 },
  { authorization: true, token: "", status: 403 },
  { authorization: false, token: null, status: 401 },
  { authorization: false, token: actionToken("owner", "hash"), status: 401 },
])(
  "gates edit-tag on header auth, validating T only when supplied: %#",
  async ({ authorization, token, status }) => {
    const body = new URLSearchParams({ i: "42", a: "user/-/state/com.google/read" });
    if (token !== null) body.set("T", token);
    const req = new Request("https://example.org/api/greader/reader/api/0/edit-tag", {
      method: "POST",
      body,
      headers: authorization ? { Authorization: `GoogleLogin auth=${"a".repeat(64)}` } : {},
    });
    expect((await handleReader(req, "edit-tag")).status).toBe(status);
    if (status === 200)
      expect(changeItems).toHaveBeenCalledWith("owner", { ids: [42] }, [
        { kind: "read", enabled: true },
      ]);
    else expect(changeItems).not.toHaveBeenCalled();
  },
);
