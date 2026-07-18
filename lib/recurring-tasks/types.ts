export type RecurrenceType = "weekly" | "monthly" | "interval";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RecurrencePattern = {
  recurrence_type: RecurrenceType;
  days_of_week: number[] | null;
  day_of_month: number | null;
  interval_days: number | null;
};

/** Human-readable recurrence summary, e.g. "Weekly on Mon, Wed" — shared by the recurring-task management list and any task row that wants to show why a task repeats. */
export function describeRecurrence(pattern: RecurrencePattern): string {
  if (pattern.recurrence_type === "weekly") {
    return `Weekly on ${(pattern.days_of_week ?? []).map((d) => DAY_LABELS[d]).join(", ")}`;
  }
  if (pattern.recurrence_type === "monthly") {
    return `Monthly on day ${pattern.day_of_month}`;
  }
  return `Every ${pattern.interval_days} day${pattern.interval_days === 1 ? "" : "s"}`;
}
