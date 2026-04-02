import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import { users, sessions, accounts, verifications } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null;

export function getAuth() {
  if (!_auth) {
    _auth = betterAuth({
      database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
          user: users,
          session: sessions,
          account: accounts,
          verification: verifications,
        },
      }),
      emailAndPassword: {
        enabled: true,
      },
      session: {
        cookieCache: { enabled: true, maxAge: 60 * 5 },
      },
      trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
    });
  }
  return _auth;
}

export type Session = ReturnType<typeof betterAuth>["$Infer"]["Session"];
