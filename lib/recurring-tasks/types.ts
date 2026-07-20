export type RecurrenceType = "weekly" | "monthly" | "monthly_nth_weekday" | "yearly" | "interval" | "completion";
export type CompletionOffsetUnit = "day" | "week" | "month" | "year";
export type MonthClamp = "clamp" | "roll";
export type EndsType = "never" | "date" | "count";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
/** Index 0 unused — week_of_month is 1-5, or -1 for "last". */
export const WEEK_OF_MONTH_LABELS = ["", "1st", "2nd", "3rd", "4th", "5th"];
export const COMPLETION_OFFSET_UNITS: CompletionOffsetUnit[] = ["day", "week", "month", "year"];

export type RecurrencePattern = {
  recurrence_type: RecurrenceType;
  days_of_week: number[] | null;
  day_of_month: number | null;
  interval_days: number | null;
  month_of_year: number | null;
  week_of_month: number | null;
  weekday_of_month: number | null;
  month_clamp: MonthClamp;
  completion_offset_count: number | null;
  completion_offset_unit: CompletionOffsetUnit | null;
  ends_type: EndsType;
  ends_date: string | null;
  ends_count: number | null;
};

function weekOfMonthLabel(weekOfMonth: number): string {
  return weekOfMonth === -1 ? "Last" : WEEK_OF_MONTH_LABELS[weekOfMonth] ?? `${weekOfMonth}th`;
}

/** Human-readable recurrence summary, e.g. "Weekly on Mon, Wed" — shared by the recurring-task management list and any task row that wants to show why a task repeats. */
export function describeRecurrence(pattern: RecurrencePattern): string {
  let base: string;
  if (pattern.recurrence_type === "weekly") {
    base = `Weekly on ${(pattern.days_of_week ?? []).map((d) => DAY_LABELS[d]).join(", ")}`;
  } else if (pattern.recurrence_type === "monthly") {
    base = `Monthly on day ${pattern.day_of_month}`;
  } else if (pattern.recurrence_type === "monthly_nth_weekday") {
    base = `Monthly on the ${weekOfMonthLabel(pattern.week_of_month ?? 1)} ${DAY_LABELS[pattern.weekday_of_month ?? 0]}`;
  } else if (pattern.recurrence_type === "yearly") {
    base = `Yearly on ${MONTH_LABELS[(pattern.month_of_year ?? 1) - 1]} ${pattern.day_of_month}`;
  } else if (pattern.recurrence_type === "completion") {
    const count = pattern.completion_offset_count ?? 1;
    const unit = pattern.completion_offset_unit ?? "day";
    base = `${count} ${unit}${count === 1 ? "" : "s"} after completion`;
  } else {
    base = `Every ${pattern.interval_days} day${pattern.interval_days === 1 ? "" : "s"}`;
  }

  if (pattern.ends_type === "date") return `${base} · ends ${pattern.ends_date}`;
  if (pattern.ends_type === "count") return `${base} · ends after ${pattern.ends_count}`;
  return base;
}
