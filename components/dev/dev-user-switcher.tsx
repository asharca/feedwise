"use client";

import { useEffect, useState } from "react";

interface DevUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * DEV-ONLY floating panel to switch the logged-in user without a password.
 * Talks to the dev-login better-auth plugin (see lib/auth/dev-login.ts), which
 * only exists when ENABLE_DEV_LOGIN=1 in a non-production env. This component
 * is additionally tree-shaken from production builds by the NODE_ENV guard at
 * its mount site, and it silently renders nothing if the endpoint 404s (flag
 * off), so there is no way for it to appear or function in production.
 */
export function DevUserSwitcher() {
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/dev-login/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUsers(d?.users ?? null))
      .catch(() => setUsers(null));
  }, []);

  // Endpoint missing/empty (flag off) → don't render anything.
  if (!users || users.length === 0) return null;

  async function loginAs(userId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/dev-login/as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
      // Hard reload so server components re-read the new session cookie.
      window.location.href = "/reader";
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-3 left-3 z-[9999] font-mono text-xs">
      {open && (
        <div className="mb-2 max-h-80 w-72 overflow-y-auto rounded-lg border border-amber-500/40 bg-background/95 shadow-xl backdrop-blur">
          <div className="sticky top-0 border-b border-border bg-amber-500/10 px-3 py-2 font-semibold text-amber-600">
            Dev: log in as…
          </div>
          <ul>
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => loginAs(u.id)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent disabled:opacity-50"
                >
                  <span className="font-medium text-foreground">{u.name ?? "(no name)"}</span>
                  <span className="truncate text-muted-foreground">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 font-semibold text-amber-600 shadow-lg backdrop-blur hover:bg-amber-500/25"
      >
        👤 dev login {open ? "▾" : "▴"}
      </button>
    </div>
  );
}
