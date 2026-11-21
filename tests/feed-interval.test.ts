import { expect, it } from "vitest";
import { adaptiveInterval, nextFetchAt } from "@/lib/feeds/interval";

it.each([
  [0, 0, 1440],
  [7, 0, 1440],
  [100, 0, 101],
  [100, 1, 202],
  [100, 4, 1440],
  [10_000, 0, 15],
  [10_000, 5, 480],
  [10_000, 42, 480],
])("schedules %d first-seen with %d failures at %d minutes", (weekly, failures, expected) => {
  expect(adaptiveInterval([], weekly, failures)).toBe(expected);
});

const atMinute = (minute: number) => new Date(minute * 60_000);

it("estimates publication cadence independently of the size of the first crawl", () => {
  const daily = Array.from({ length: 30 }, (_, day) => atMinute(day * 1440));
  expect(adaptiveInterval(daily, 355)).toBe(1440);
  const fast = Array.from({ length: 20 }, (_, i) => atMinute(i * 10));
  expect(adaptiveInterval(fast, 20)).toBe(15);
});

it("rounds the average of n-1 gaps before applying capped backoff", () => {
  const irregular = [atMinute(17), atMinute(0), atMinute(65)];
  expect(adaptiveInterval(irregular, 1)).toBe(33);
  expect(adaptiveInterval(irregular, 1, 2)).toBe(132);
  expect(adaptiveInterval([atMinute(0), atMinute(0)], 1, 1)).toBe(30);
  expect(adaptiveInterval([atMinute(0), atMinute(10_080)], 355)).toBe(1440);
});

it("falls back to first-seen counts if only one recent publication date is usable", () => {
  expect(adaptiveInterval([atMinute(0)], 20)).toBe(504);
});

it("waits at least as long as the adaptive interval and honors server hints up to a day", () => {
  const now = new Date(0);
  expect(nextFetchAt(now, 15, 1000).getTime()).toBe(15 * 60_000);
  expect(nextFetchAt(now, 15, 3_600_000).getTime()).toBe(3_600_000);
  expect(nextFetchAt(now, 15, 90_000_000).getTime()).toBe(86_400_000);
});
