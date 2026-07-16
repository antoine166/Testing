export type RecurrenceType = "weekly" | "monthly" | "interval";

export type RecurringTemplate = {
  recurrence_type: RecurrenceType;
  days_of_week: number[] | null;
  day_of_month: number | null;
  interval_days: number | null;
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

function monthlyOccurrences(startAfter: Date, dayOfMonth: number, count: number): Date[] {
  const results: Date[] = [];
  let year = startAfter.getFullYear();
  let month = startAfter.getMonth();

  for (let i = 0; i < 600 && results.length < count; i++) {
    const clampedDay = Math.min(dayOfMonth, daysInMonth(year, month));
    const candidate = new Date(year, month, clampedDay);
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
 */
export function nextOccurrences(template: RecurringTemplate, today: string, count: number): string[] {
  if (count <= 0) return [];

  const todayDate = parseLocalDate(today);

  if (template.recurrence_type === "weekly") {
    if (!template.days_of_week || template.days_of_week.length === 0) return [];
    const startAfter = template.last_generated_date
      ? parseLocalDate(template.last_generated_date)
      : addDays(todayDate, -1);
    return weeklyOccurrences(startAfter, template.days_of_week, count).map(formatLocalDate);
  }

  if (template.recurrence_type === "monthly") {
    if (!template.day_of_month) return [];
    const startAfter = template.last_generated_date
      ? parseLocalDate(template.last_generated_date)
      : addDays(todayDate, -1);
    return monthlyOccurrences(startAfter, template.day_of_month, count).map(formatLocalDate);
  }

  if (template.recurrence_type === "interval") {
    if (!template.interval_days || template.interval_days <= 0) return [];
    // A template with no prior generation gets its first occurrence today,
    // not one full interval out — starting "now" is what "every N days"
    // means when you've just created the recurring task.
    const startAfter = template.last_generated_date
      ? parseLocalDate(template.last_generated_date)
      : addDays(todayDate, -template.interval_days);
    return intervalOccurrences(startAfter, template.interval_days, count).map(formatLocalDate);
  }

  return [];
}
