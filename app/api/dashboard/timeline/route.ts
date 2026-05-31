import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getDashboardTimeline } from "@/lib/db/queries/stats";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string | null): Date | null {
  if (!value || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = parseIsoDate(searchParams.get("from"));
  const toParam = parseIsoDate(searchParams.get("to"));

  // Default end-of-window: today UTC. Default start: today - (days - 1).
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  let from: Date;
  let to: Date;
  if (fromParam && toParam) {
    from = fromParam;
    to = toParam;
  } else {
    const rawDays = parseInt(searchParams.get("days") ?? "7", 10);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 7;
    to = todayUtc;
    from = new Date(todayUtc);
    from.setUTCDate(from.getUTCDate() - (days - 1));
  }

  const data = await getDashboardTimeline(session.user.id, from, to);
  return NextResponse.json({ success: true, data });
}
