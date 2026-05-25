const WEEKDAY_NAMES: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export function formatTimeList(hour: string, minute: string): string {
  const minutes = minute.includes(",") ? minute.split(",") : [minute];
  const hours = hour.includes(",") ? hour.split(",") : [hour];
  const times: string[] = [];
  for (const h of hours) {
    for (const m of minutes) {
      const hh = parseInt(h);
      const mm = parseInt(m);
      if (!isNaN(hh) && !isNaN(mm)) {
        times.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
      }
    }
  }
  return times.join(", ");
}

export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, day, month, weekday] = parts;
  const timeStr = formatTimeList(hour, minute);
  if (!timeStr) return cron;

  if (day === "*" && month === "*" && weekday === "*") {
    return `Every day at ${timeStr}`;
  }
  if (day === "*" && month === "*" && weekday === "1-5") {
    return `Weekdays at ${timeStr}`;
  }
  if (day === "*" && month === "*" && /^\d$/.test(weekday)) {
    return `Every ${WEEKDAY_NAMES[parseInt(weekday)] ?? weekday} at ${timeStr}`;
  }
  if (day === "*" && month === "*" && weekday.includes(",")) {
    const days = weekday
      .split(",")
      .map((v) => WEEKDAY_NAMES[parseInt(v)] ?? v);
    return `Every ${days.join(", ")} at ${timeStr}`;
  }
  if (/^\d+$/.test(day) && month === "*" && weekday === "*") {
    return `Day ${day} of each month at ${timeStr}`;
  }

  return cron;
}
