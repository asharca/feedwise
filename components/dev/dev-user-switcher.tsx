"use client";

import { useEffect, useRef, useState } from "react";

interface DevUser {
  id: string;
  email: string;
  name: string | null;
}

const POS_KEY = "dev-switcher-pos";

/**
 * DEV-ONLY draggable floating window to switch the logged-in user without a
 * password. Talks to the dev-login better-auth plugin (see lib/auth/dev-login.ts),
 * which only exists when ENABLE_DEV_LOGIN=1 in a non-production env. Its mount is
 * additionally guarded by NODE_ENV in app/layout.tsx, and it renders nothing if
 * the endpoint 404s (flag off).
 *
 * It is draggable (by the pill or the panel's title bar) so it never permanently
 * blocks page content like Settings; the position persists in localStorage.
 */
export function DevUserSwitcher() {
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const nodeRef = useRef<HTMLDivElement>(null);
  // A single in-flight drag gesture. `toggle` records whether a no-move release
  // should be treated as a click (the pill) or ignored (the title bar).
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    toggle: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/dev-login/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUsers(d?.users ?? null))
      .catch(() => setUsers(null));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) setPos(JSON.parse(raw));
    } catch {
      /* ignore malformed stored position */
    }
  }, []);

  // Endpoint missing/empty (flag off) → don't render anything.
  if (!users || users.length === 0) return null;

  function clampToViewport(x: number, y: number) {
    const el = nodeRef.current;
    const w = el?.offsetWidth ?? 160;
    const h = el?.offsetHeight ?? 40;
    const maxX = Math.max(4, window.innerWidth - w - 4);
    const maxY = Math.max(4, window.innerHeight - h - 4);
    return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
  }

  function startDrag(e: React.PointerEvent, toggle: boolean) {
    if (e.button !== 0) return;
    const rect = nodeRef.current!.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      moved: false,
      toggle,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // Small threshold so a click isn't mistaken for a drag.
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setPos(clampToViewport(d.origX + dx, d.origY + dy));
  }

  function endDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      const final = clampToViewport(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY));
      setPos(final);
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(final));
      } catch {
        /* ignore quota/availability errors */
      }
    } else if (d.toggle) {
      setOpen((o) => !o);
    }
  }

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

  // Until dragged, anchor to the bottom-left corner; afterward, follow the
  // persisted top-left position.
  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { left: 12, bottom: 12 };

  return (
    <div ref={nodeRef} style={style} className="fixed z-[9999] font-mono text-xs">
      {open && (
        // Floats above the pill so toggling doesn't shove the handle around.
        <div className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-lg border border-amber-500/40 bg-background/95 shadow-xl backdrop-blur">
          <div
            onPointerDown={(e) => startDrag(e, false)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            className="flex touch-none cursor-grab select-none items-center justify-between gap-2 border-b border-border bg-amber-500/10 px-3 py-2 active:cursor-grabbing"
          >
            <span className="flex items-center gap-1.5 font-semibold text-amber-600">
              <span aria-hidden className="tracking-[0.2em] text-amber-600/50">
                ⠿
              </span>
              Dev: log in as…
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded px-1 text-amber-600/70 hover:bg-amber-500/15 hover:text-amber-600"
            >
              ✕
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto">
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
        onPointerDown={(e) => startDrag(e, true)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        className="touch-none cursor-grab select-none rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 font-semibold text-amber-600 shadow-lg backdrop-blur hover:bg-amber-500/25 active:cursor-grabbing"
        title="Drag to move · click to toggle"
      >
        👤 dev login {open ? "▾" : "▴"}
      </button>
    </div>
  );
}
