export type RecurrenceType = "weekly" | "monthly" | "monthly_nth_weekday" | "yearly" | "interval" | "completion";
export type MonthClamp = "clamp" | "roll";
export type CompletionOffsetUnit = "day" | "week" | "month" | "year";

export type RecurringTemplate = {
  recurrence_type: RecurrenceType;
  days_of_week: number[] | null;
  day_of_month: number | null;
  interval_days: number | null;
  month_of_year: number | null;
  week_of_month: number | null;
  weekday_of_month: number | null;
  month_clamp: MonthClamp;
  last_generated_date: string | null;
};

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of this month (month is 0-indexed).
  return new Date(year, month + 1, 0).getDate();
}

/** Adds `months` calendar months to `date`, applying `mode` when the target month is shorter than the original day-of-month (e.g. Jan 31 + 1 month). */
function addMonthsClamped(date: Date, months: number, mode: MonthClamp): Date {
  const totalMonths = date.getFullYear() * 12 + date.getMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12;
  const day = date.getDate();
  const maxDay = daysInMonth(year, month);
  if (day <= maxDay) return new Date(year, month, day);
  return mode === "roll" ? new Date(year, month + 1, 1) : new Date(year, month, maxDay);
}

/** The date of the nth (or, for -1, last) `weekday` in `year`/`month` — null if that month has no such occurrence (e.g. a "5th Monday" that doesn't exist). */
function nthWeekdayOfMonth(year: number, month: number, weekOfMonth: number, weekday: number): Date | null {
  if (weekOfMonth === -1) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month, last.getDate() - diff);
  }
  const first = new Date(year, month, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  const day = 1 + diff + (weekOfMonth - 1) * 7;
  if (day > daysInMonth(year, month)) return null;
  return new Date(year, month, day);
}

function weeklyOccurrences(startAfter: Date, daysOfWeek: number[], count: number): Date[] {
  const results: Date[] = [];
  let cursor = new Date(startAfter);
  // Cap the search so a malformed template (e.g. empty days_of_week slipping
  // past validation) can't spin forever instead of just returning nothing.
  for (let i = 0; i < 3650 && results.length < count; i++) {
    cursor = addDays(cursor, 1);
    if (daysOfWeek.includes(cursor.getDay())) {
      results.push(new Date(cursor));
    }
  }
  return results;
}

function monthlyOccurrences(startAfter: Date, dayOfMonth: number, monthClamp: MonthClamp, count: number): Date[] {
  const results: Date[] = [];
  let year = startAfter.getFullYear();
  let month = startAfter.getMonth();

  for (let i = 0; i < 600 && results.length < count; i++) {
    const maxDay = daysInMonth(year, month);
    const candidate =
      dayOfMonth <= maxDay
        ? new Date(year, month, dayOfMonth)
        : monthClamp === "roll"
          ? new Date(year, month + 1, 1)
          : new Date(year, month, maxDay);
    if (candidate > startAfter) {
      results.push(candidate);
    }
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return results;
}

function monthlyNthWeekdayOccurrences(
  startAfter: Date,
  weekOfMonth: number,
  weekdayOfMonth: number,
  count: number,
): Date[] {
  const results: Date[] = [];
  let year = startAfter.getFullYear();
  let month = startAfter.getMonth();

  for (let i = 0; i < 600 && results.length < count; i++) {
    const candidate = nthWeekdayOfMonth(year, month, weekOfMonth, weekdayOfMonth);
    if (candidate && candidate > startAfter) {
      results.push(candidate);
    }
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return results;
}

function yearlyOccurrences(
  startAfter: Date,
  monthOfYear: number,
  dayOfMonth: number,
  monthClamp: MonthClamp,
  count: number,
): Date[] {
  const results: Date[] = [];
  const monthIndex = monthOfYear - 1;
  let year = startAfter.getFullYear();

  for (let i = 0; i < 200 && results.length < count; i++) {
    const maxDay = daysInMonth(year, monthIndex);
    const candidate =
      dayOfMonth <= maxDay
        ? new Date(year, monthIndex, dayOfMonth)
        : monthClamp === "roll"
          ? new Date(year, monthIndex + 1, 1)
          : new Date(year, monthIndex, maxDay);
    if (candidate > startAfter) {
      results.push(candidate);
    }
    year++;
  }
  return results;
}

function intervalOccurrences(startAfter: Date, intervalDays: number, count: number): Date[] {
  const results: Date[] = [];
  let cursor = new Date(startAfter);
  for (let i = 0; i < count; i++) {
    cursor = addDays(cursor, intervalDays);
    results.push(new Date(cursor));
  }
  return results;
}

/**
 * The next `count` occurrence dates (YYYY-MM-DD) for a template, strictly
 * after its last generated date (or, for a template that's never generated
 * anything yet, positioned so the very first occurrence can be today).
 *
 * Not applicable to recurrence_type "completion" — those aren't pre-generated
 * ahead of a horizon, they're spawned one at a time when the prior occurrence
 * is completed (see addCompletionOffset below and the task-completion route).
 */
export function nextOccurrences(template: RecurringTemplate, today: string, count: number): string[] {
  if (count <= 0) return [];

  const todayDate = parseLocalDate(today);
  const startAfter = template.last_generated_date
    ? parseLocalDate(template.last_generated_date)
    : addDays(todayDate, -1);

  if (template.recurrence_type === "weekly") {
    if (!template.days_of_week || template.days_of_week.length === 0) return [];
    return weeklyOccurrences(startAfter, template.days_of_week, count).map(formatLocalDate);
  }

  if (template.recurrence_type === "monthly") {
    if (!template.day_of_month) return [];
    return monthlyOccurrences(startAfter, template.day_of_month, template.month_clamp, count).map(formatLocalDate);
  }

  if (template.recurrence_type === "monthly_nth_weekday") {
    if (template.week_of_month == null || template.weekday_of_month == null) return [];
    return monthlyNthWeekdayOccurrences(startAfter, template.week_of_month, template.weekday_of_month, count).map(
      formatLocalDate,
    );
  }

  if (template.recurrence_type === "yearly") {
    if (!template.day_of_month || !template.month_of_year) return [];
    return yearlyOccurrences(startAfter, template.month_of_year, template.day_of_month, template.month_clamp, count).map(
      formatLocalDate,
    );
  }

  if (template.recurrence_type === "interval") {
    if (!template.interval_days || template.interval_days <= 0) return [];
    // A template with no prior generation gets its first occurrence today,
    // not one full interval out — starting "now" is what "every N days"
    // means when you've just created the recurring task.
    const intervalStartAfter = template.last_generated_date
      ? startAfter
      : addDays(todayDate, -template.interval_days);
    return intervalOccurrences(intervalStartAfter, template.interval_days, count).map(formatLocalDate);
  }

  return [];
}

/** completion-anchored next date: `completedDate` + `count` `unit`(s), month/year clamped (e.g. Jan 31 + 1 month -> Feb 28). */
export function addCompletionOffset(completedDate: string, count: number, unit: CompletionOffsetUnit): string {
  const date = parseLocalDate(completedDate);
  if (unit === "day") return formatLocalDate(addDays(date, count));
  if (unit === "week") return formatLocalDate(addDays(date, count * 7));
  if (unit === "month") return formatLocalDate(addMonthsClamped(date, count, "clamp"));
  return formatLocalDate(addMonthsClamped(date, count * 12, "clamp"));
}
