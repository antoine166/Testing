import { describe, expect, it } from "vitest";
import {
  computeStreak,
  countThisWeek,
  isAtRisk,
  isHabitDueToday,
  isPendingToday,
  type Habit,
  type HabitLog,
} from "./streaks";

// Calendar anchor for every test: 2026-07-20 is a Monday, so the "current
// week" for today = 2026-07-24 (a Friday) runs Mon 07-20 through Sun 07-26.

const daily: Habit = { frequency: "daily", frequency_days: null, target_count: null };
const monWedFri: Habit = { frequency: "specific_days", frequency_days: [1, 3, 5], target_count: null };
const twicePerWeek: Habit = { frequency: "times_per_week", frequency_days: null, target_count: 2 };

function logs(...dates: string[]): HabitLog[] {
  return dates.map((logged_date) => ({ logged_date }));
}

describe("computeStreak — daily habits", () => {
  it("returns zero with no logs", () => {
    expect(computeStreak(daily, [], "2026-07-24")).toEqual({ current: 0, longest: 0 });
  });

  it("counts consecutive days through today", () => {
    const result = computeStreak(daily, logs("2026-07-22", "2026-07-23", "2026-07-24"), "2026-07-24");
    expect(result).toEqual({ current: 3, longest: 3 });
  });

  it("gives grace for today while the day isn't over yet", () => {
    // Today not logged yet — streak counts from yesterday instead of breaking.
    const result = computeStreak(daily, logs("2026-07-22", "2026-07-23"), "2026-07-24");
    expect(result.current).toBe(2);
  });

  it("breaks the current streak at a missed day but remembers the longest run", () => {
    const result = computeStreak(daily, logs("2026-07-20", "2026-07-21", "2026-07-23"), "2026-07-24");
    expect(result).toEqual({ current: 1, longest: 2 });
  });
});

describe("computeStreak — specific-days habits", () => {
  it("skips non-required days without breaking the streak", () => {
    // Mon 07-20 and Wed 07-22 logged; Tue/Thu aren't required for Mon/Wed/Fri.
    const result = computeStreak(monWedFri, logs("2026-07-20", "2026-07-22"), "2026-07-23");
    expect(result).toEqual({ current: 2, longest: 2 });
  });

  it("breaks when a required day was missed", () => {
    // Fri 07-17 required but unlogged, so the run only reaches back to Mon.
    const result = computeStreak(monWedFri, logs("2026-07-15", "2026-07-20", "2026-07-22"), "2026-07-23");
    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });
});

describe("computeStreak — times-per-week habits", () => {
  it("credits the in-progress week once the target is hit", () => {
    // 2 logs last week (Mon 07-13's week) + 2 this week = 2-week streak.
    const result = computeStreak(twicePerWeek, logs("2026-07-13", "2026-07-15", "2026-07-20", "2026-07-21"), "2026-07-24");
    expect(result).toEqual({ current: 2, longest: 2 });
  });

  it("doesn't credit the current week before the target is hit", () => {
    const result = computeStreak(twicePerWeek, logs("2026-07-20"), "2026-07-24");
    expect(result.current).toBe(0);
  });
});

describe("isHabitDueToday", () => {
  it("specific-days habits are only due on their days", () => {
    expect(isHabitDueToday(monWedFri, "2026-07-24")).toBe(true); // Friday
    expect(isHabitDueToday(monWedFri, "2026-07-23")).toBe(false); // Thursday
  });

  it("times-per-week habits are due any day", () => {
    expect(isHabitDueToday(twicePerWeek, "2026-07-23")).toBe(true);
  });
});

describe("countThisWeek", () => {
  it("only counts logs from the current Monday-anchored week", () => {
    expect(countThisWeek(logs("2026-07-19", "2026-07-20", "2026-07-24"), "2026-07-24")).toBe(2);
  });
});

describe("isPendingToday", () => {
  it("clears once today is logged", () => {
    expect(isPendingToday(daily, logs("2026-07-24"), "2026-07-24")).toBe(false);
    expect(isPendingToday(daily, [], "2026-07-24")).toBe(true);
  });

  it("times-per-week clears for the rest of the week once the target is hit", () => {
    // Target hit Mon+Tue; Friday needs no action even though it wasn't logged today.
    expect(isPendingToday(twicePerWeek, logs("2026-07-20", "2026-07-21"), "2026-07-24")).toBe(false);
    expect(isPendingToday(twicePerWeek, logs("2026-07-20"), "2026-07-24")).toBe(true);
  });
});

describe("isAtRisk", () => {
  it("daily: at risk only when yesterday was already missed", () => {
    expect(isAtRisk(daily, logs("2026-07-23"), "2026-07-24")).toBe(false);
    expect(isAtRisk(daily, logs("2026-07-22"), "2026-07-24")).toBe(true);
  });

  it("never at risk once today is logged", () => {
    expect(isAtRisk(daily, logs("2026-07-24"), "2026-07-24")).toBe(false);
  });

  it("specific-days: looks back to the last required day, skipping off days", () => {
    // Mon/Wed/Fri habit checked on Friday: Wednesday is the day that matters.
    expect(isAtRisk(monWedFri, logs("2026-07-22"), "2026-07-24")).toBe(false);
    expect(isAtRisk(monWedFri, logs("2026-07-20"), "2026-07-24")).toBe(true);
  });

  it("times-per-week: fires only when every remaining day is needed", () => {
    // The documented example: 4x/week with 0 done — safe on Wednesday
    // (5 days left, 4 needed), at risk from Thursday (4 left, 4 needed).
    const fourPerWeek: Habit = { frequency: "times_per_week", frequency_days: null, target_count: 4 };
    expect(isAtRisk(fourPerWeek, [], "2026-07-22")).toBe(false);
    expect(isAtRisk(fourPerWeek, [], "2026-07-23")).toBe(true);
  });
});
