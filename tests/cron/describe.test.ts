import { describe, it, expect } from "vitest";
import { describeCron, formatTimeList } from "@/lib/cron/describe";

describe("formatTimeList", () => {
  it("zero-pads a single time", () => {
    expect(formatTimeList("8", "0")).toBe("08:00");
  });
  it("joins multiple hours with comma", () => {
    expect(formatTimeList("8,18", "0")).toBe("08:00, 18:00");
  });
  it("produces the cross-product of multiple hours and minutes", () => {
    expect(formatTimeList("8,18", "0,30")).toBe("08:00, 08:30, 18:00, 18:30");
  });
  it("returns empty string for non-numeric input", () => {
    expect(formatTimeList("x", "y")).toBe("");
  });
});

describe("describeCron", () => {
  it("daily", () => {
    expect(describeCron("0 8 * * *")).toBe("Every day at 08:00");
  });
  it("weekly single day", () => {
    expect(describeCron("30 9 * * 1")).toBe("Every Monday at 09:30");
  });
  it("weekdays", () => {
    expect(describeCron("0 8 * * 1-5")).toBe("Weekdays at 08:00");
  });
  it("multiple weekdays", () => {
    expect(describeCron("0 8 * * 1,3,5")).toBe("Every Monday, Wednesday, Friday at 08:00");
  });
  it("monthly", () => {
    expect(describeCron("0 8 15 * *")).toBe("Day 15 of each month at 08:00");
  });
  it("twice daily", () => {
    expect(describeCron("0 8,18 * * *")).toBe("Every day at 08:00, 18:00");
  });
  it("returns input for malformed expressions", () => {
    expect(describeCron("nonsense")).toBe("nonsense");
  });
});
