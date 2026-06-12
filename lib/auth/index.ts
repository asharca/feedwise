import { networkInterfaces } from "node:os";
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
    // Allow common dev server ports so auth works regardless of which port Next.js binds to
    for (let p = 3000; p <= 3010; p++) {
      origins.add(`http://localhost:${p}`);
      origins.add(`http://127.0.0.1:${p}`);
    }
    // Phones on the same network reach the dev server via this machine's LAN
    // IPs. better-auth enforces its origin (CSRF) check on any request that
    // carries cookies, so without these entries LAN logins 403 with
    // "Invalid origin" (also add them to allowedDevOrigins in next.config.ts
    // for the dev-asset layer).
    for (const ifaceList of Object.values(networkInterfaces())) {
      for (const iface of ifaceList ?? []) {
        if (iface.family === "IPv4" && !iface.internal) {
          for (let p = 3000; p <= 3010; p++) {
            origins.add(`http://${iface.address}:${p}`);
          }
        }
      }
    }
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
        // Keep sessions valid for 30 days, rolling-refresh once a day so
        // active users never see a sudden logout.
        expiresIn: 60 * 60 * 24 * 30,
        updateAge: 60 * 60 * 24,
        cookieCache: { enabled: true, maxAge: 60 * 5 },
      },
      advanced: {
        // Dev is reached over plain http (localhost, or a LAN IP from a
        // phone) where browsers silently DROP `Secure` cookies — but
        // BETTER_AUTH_URL is an https URL in .env, which makes better-auth
        // emit `__Secure-`/`Secure` session cookies and login never sticks
        // off-localhost. Pin secure cookies to production deployments only.
        useSecureCookies: process.env.NODE_ENV === "production",
      },
      trustedOrigins: buildTrustedOrigins(),
    });
  }
  return _auth;
}

export type Session = ReturnType<typeof betterAuth>["$Infer"]["Session"];
