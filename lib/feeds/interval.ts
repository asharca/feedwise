const DAY_MINUTES = 24 * 60;

/** Average publication gap in a recent sample; first-seen counts are a fallback for undated feeds. */
export function adaptiveInterval(
  published: readonly Date[],
  weeklyCount: number,
  consecutiveFailures = 0,
): number {
  let minutes = (7 * DAY_MINUTES) / Math.max(1, weeklyCount);
  if (published.length >= 2) {
    const times = published.map((date) => date.getTime());
    minutes = (Math.max(...times) - Math.min(...times)) / ((times.length - 1) * 60_000);
  }
  const base = Math.min(DAY_MINUTES, Math.max(15, Math.round(minutes)));
  return Math.min(DAY_MINUTES, base * 2 ** Math.min(5, consecutiveFailures));
}

export function nextFetchAt(now: Date, minutes: number, minimumDelayMs = 0): Date {
  const delay = Math.min(DAY_MINUTES * 60_000, Math.max(minutes * 60_000, minimumDelayMs));
  return new Date(now.getTime() + delay);
}
