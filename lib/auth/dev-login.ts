import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

/**
 * DEV-ONLY better-auth plugin: list users and mint a session for any of them
 * WITHOUT a password. It reuses better-auth's own internalAdapter.createSession
 * + setSessionCookie, so the cookie is a fully valid, correctly-signed session
 * (no hand-rolled cookie signing).
 *
 * SAFETY: this plugin is only ever registered by getAuth() when
 * `NODE_ENV !== "production"` AND `ENABLE_DEV_LOGIN === "1"`. In production the
 * endpoints below do not exist at all (the better-auth handler returns 404), so
 * there is no password-less login surface to reach. Never register it otherwise.
 *
 * Endpoints (under the better-auth base path, i.e. /api/auth):
 *   GET  /api/auth/dev-login/users  → [{ id, email, name }]
 *   POST /api/auth/dev-login/as     → { userId } sets the session cookie
 */
export function devLoginPlugin() {
  return {
    id: "dev-login",
    endpoints: {
      devListUsers: createAuthEndpoint(
        "/dev-login/users",
        { method: "GET" },
        async (c) => {
          const users = await c.context.adapter.findMany<{
            id: string;
            email: string;
            name: string | null;
          }>({
            model: "user",
            limit: 100,
          });
          return c.json({
            users: users.map((u) => ({ id: u.id, email: u.email, name: u.name })),
          });
        },
      ),
      devLoginAs: createAuthEndpoint(
        "/dev-login/as",
        { method: "POST", body: z.object({ userId: z.string().min(1) }) },
        async (c) => {
          const user = await c.context.internalAdapter.findUserById(c.body.userId);
          if (!user) throw c.error("BAD_REQUEST", { message: "User not found" });

          const session = await c.context.internalAdapter.createSession(c.body.userId);
          // setSessionCookie wants the wrapped { session, user } shape; createSession
          // returns the raw session row, so wrap it with the user we just fetched.
          await setSessionCookie(c, { session, user });
          return c.json({ ok: true, userId: user.id, email: user.email });
        },
      ),
    },
  };
}
