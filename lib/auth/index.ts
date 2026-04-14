import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import { users, sessions, accounts, verifications } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null;

function buildTrustedOrigins() {
  const origins = new Set<string>();

  const fromEnv = [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_APP_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  for (const origin of fromEnv) origins.add(origin);

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return Array.from(origins);
}

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
      trustedOrigins: buildTrustedOrigins(),
    });
  }
  return _auth;
}

export type Session = ReturnType<typeof betterAuth>["$Infer"]["Session"];
