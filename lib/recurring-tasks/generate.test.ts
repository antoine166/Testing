import { describe, expect, it } from "vitest";
import { addCompletionOffset, nextOccurrences, type RecurringTemplate } from "./generate";

// Calendar anchors used throughout (verified against a real calendar):
// 2026-07-20 is a Monday; 2026 is not a leap year, 2028 is; June and August
// 2026 have five Mondays, July 2026 only four.

function template(overrides: Partial<RecurringTemplate>): RecurringTemplate {
  return {
    recurrence_type: "weekly",
    days_of_week: null,
    day_of_month: null,
    interval_days: null,
    month_of_year: null,
    week_of_month: null,
    weekday_of_month: null,
    month_clamp: "clamp",
    last_generated_date: null,
    ...overrides,
  };
}

describe("nextOccurrences — weekly", () => {
  it("a brand-new template can have its first occurrence today", () => {
    // Mondays-only template created on a Monday: today counts.
    const t = template({ recurrence_type: "weekly", days_of_week: [1] });
    expect(nextOccurrences(t, "2026-07-20", 3)).toEqual(["2026-07-20", "2026-07-27", "2026-08-03"]);
  });

  it("walks multiple weekdays in calendar order", () => {
    // Mon+Fri template created on a Tuesday: Fri comes first.
    const t = template({ recurrence_type: "weekly", days_of_week: [1, 5] });
    expect(nextOccurrences(t, "2026-07-21", 3)).toEqual(["2026-07-24", "2026-07-27", "2026-07-31"]);
  });

  it("resumes strictly after the last generated date", () => {
    const t = template({ recurrence_type: "weekly", days_of_week: [1, 5], last_generated_date: "2026-07-24" });
    expect(nextOccurrences(t, "2026-07-21", 2)).toEqual(["2026-07-27", "2026-07-31"]);
  });

  it("returns nothing for an empty day set instead of looping forever", () => {
    const t = template({ recurrence_type: "weekly", days_of_week: [] });
    expect(nextOccurrences(t, "2026-07-21", 3)).toEqual([]);
  });
});

describe("nextOccurrences — monthly", () => {
  it("clamps day 31 to shorter months", () => {
    const t = template({ recurrence_type: "monthly", day_of_month: 31, last_generated_date: "2026-01-31" });
    expect(nextOccurrences(t, "2026-01-31", 3)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("rolls to the 1st of the next month when configured", () => {
    const t = template({
      recurrence_type: "monthly",
      day_of_month: 31,
      month_clamp: "roll",
      last_generated_date: "2026-01-31",
    });
    // Feb 31 doesn't exist -> Mar 1; Mar 31 does; Apr 31 doesn't -> May 1.
    expect(nextOccurrences(t, "2026-01-31", 3)).toEqual(["2026-03-01", "2026-03-31", "2026-05-01"]);
  });

  it("skips this month's slot when it's already in the past", () => {
    const t = template({ recurrence_type: "monthly", day_of_month: 5 });
    expect(nextOccurrences(t, "2026-07-10", 2)).toEqual(["2026-08-05", "2026-09-05"]);
  });

  it("includes today when created on the recurrence day", () => {
    const t = template({ recurrence_type: "monthly", day_of_month: 5 });
    expect(nextOccurrences(t, "2026-07-05", 1)).toEqual(["2026-07-05"]);
  });
});

describe("nextOccurrences — monthly nth weekday", () => {
  it("finds the 2nd Tuesday of each month", () => {
    const t = template({
      recurrence_type: "monthly_nth_weekday",
      week_of_month: 2,
      weekday_of_month: 2,
      last_generated_date: "2026-07-15",
    });
    expect(nextOccurrences(t, "2026-07-15", 2)).toEqual(["2026-08-11", "2026-09-08"]);
  });

  it('"last" (-1) finds the final such weekday of the month', () => {
    const t = template({
      recurrence_type: "monthly_nth_weekday",
      week_of_month: -1,
      weekday_of_month: 5,
      last_generated_date: "2026-07-15",
    });
    expect(nextOccurrences(t, "2026-07-15", 1)).toEqual(["2026-07-31"]);
  });

  it("skips months that lack a 5th occurrence of the weekday", () => {
    // June and August 2026 have five Mondays; July has only four.
    const t = template({
      recurrence_type: "monthly_nth_weekday",
      week_of_month: 5,
      weekday_of_month: 1,
      last_generated_date: "2026-06-01",
    });
    expect(nextOccurrences(t, "2026-06-01", 2)).toEqual(["2026-06-29", "2026-08-31"]);
  });
});

describe("nextOccurrences — yearly", () => {
  it("clamps Feb 29 to Feb 28 in non-leap years", () => {
    const t = template({
      recurrence_type: "yearly",
      month_of_year: 2,
      day_of_month: 29,
      last_generated_date: "2026-01-01",
    });
    expect(nextOccurrences(t, "2026-01-01", 3)).toEqual(["2026-02-28", "2027-02-28", "2028-02-29"]);
  });
});

describe("nextOccurrences — interval", () => {
  it("a brand-new template starts today, not one interval out", () => {
    const t = template({ recurrence_type: "interval", interval_days: 3 });
    expect(nextOccurrences(t, "2026-07-24", 3)).toEqual(["2026-07-24", "2026-07-27", "2026-07-30"]);
  });

  it("an existing template counts forward from the last generated date", () => {
    const t = template({ recurrence_type: "interval", interval_days: 7, last_generated_date: "2026-07-23" });
    expect(nextOccurrences(t, "2026-07-24", 2)).toEqual(["2026-07-30", "2026-08-06"]);
  });
});

describe("addCompletionOffset", () => {
  it("adds plain days and weeks", () => {
    expect(addCompletionOffset("2026-07-24", 3, "day")).toBe("2026-07-27");
    expect(addCompletionOffset("2026-07-24", 2, "week")).toBe("2026-08-07");
  });

  it("clamps month-end overflow instead of spilling into the next month", () => {
    expect(addCompletionOffset("2026-01-31", 1, "month")).toBe("2026-02-28");
  });

  it("clamps a leap-day anniversary in a non-leap year", () => {
    expect(addCompletionOffset("2028-02-29", 1, "year")).toBe("2029-02-28");
  });
});
