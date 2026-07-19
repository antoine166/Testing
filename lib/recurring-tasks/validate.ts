// Shared by every surface that creates/updates a recurring task template —
// the two API routes, the MCP connector, and the in-app Coach — so the
// pattern/ends validation rules (and the DB check-constraint shape they
// mirror) live in exactly one place instead of drifting across four.

export const RECURRENCE_TYPES = [
  "weekly",
  "monthly",
  "monthly_nth_weekday",
  "yearly",
  "interval",
  "completion",
] as const;
export const MONTH_CLAMPS = ["clamp", "roll"] as const;
export const COMPLETION_OFFSET_UNITS = ["day", "week", "month", "year"] as const;
export const ENDS_TYPES = ["never", "date", "count"] as const;

export type PatternFields = {
  recurrence_type: string;
  days_of_week: number[] | null;
  day_of_month: number | null;
  interval_days: number | null;
  month_of_year: number | null;
  week_of_month: number | null;
  weekday_of_month: number | null;
  month_clamp: string;
  completion_offset_count: number | null;
  completion_offset_unit: string | null;
};

/** Validates and normalizes the recurrence pattern fields for one `recurrence_type`, nulling out every other type's fields (matches the DB's exclusive-per-type check constraint). */
export function parseRecurrencePattern(body: Record<string, unknown>): { pattern: PatternFields } | { error: string } {
  const recurrenceType = body.recurrence_type;
  if (typeof recurrenceType !== "string" || !(RECURRENCE_TYPES as readonly string[]).includes(recurrenceType)) {
    return { error: "Invalid recurrence_type" };
  }

  const monthClamp =
    typeof body.month_clamp === "string" && (MONTH_CLAMPS as readonly string[]).includes(body.month_clamp)
      ? body.month_clamp
      : "clamp";

  const pattern: PatternFields = {
    recurrence_type: recurrenceType,
    days_of_week: null,
    day_of_month: null,
    interval_days: null,
    month_of_year: null,
    week_of_month: null,
    weekday_of_month: null,
    month_clamp: "clamp",
    completion_offset_count: null,
    completion_offset_unit: null,
  };

  if (recurrenceType === "weekly") {
    const parsed: number[] = Array.isArray(body.days_of_week) ? body.days_of_week.map(Number) : [];
    if (parsed.length === 0 || parsed.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { error: "days_of_week must be one or more of 0-6" };
    }
    pattern.days_of_week = parsed;
  } else if (recurrenceType === "monthly") {
    const dayOfMonth = Number(body.day_of_month);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { error: "day_of_month must be 1-31" };
    }
    pattern.day_of_month = dayOfMonth;
    pattern.month_clamp = monthClamp;
  } else if (recurrenceType === "monthly_nth_weekday") {
    const weekOfMonth = Number(body.week_of_month);
    const weekdayOfMonth = Number(body.weekday_of_month);
    if (!Number.isInteger(weekOfMonth) || weekOfMonth === 0 || weekOfMonth < -1 || weekOfMonth > 5) {
      return { error: "week_of_month must be 1-5, or -1 for 'last'" };
    }
    if (!Number.isInteger(weekdayOfMonth) || weekdayOfMonth < 0 || weekdayOfMonth > 6) {
      return { error: "weekday_of_month must be 0-6" };
    }
    pattern.week_of_month = weekOfMonth;
    pattern.weekday_of_month = weekdayOfMonth;
  } else if (recurrenceType === "yearly") {
    const monthOfYear = Number(body.month_of_year);
    const dayOfMonth = Number(body.day_of_month);
    if (!Number.isInteger(monthOfYear) || monthOfYear < 1 || monthOfYear > 12) {
      return { error: "month_of_year must be 1-12" };
    }
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { error: "day_of_month must be 1-31" };
    }
    pattern.month_of_year = monthOfYear;
    pattern.day_of_month = dayOfMonth;
    pattern.month_clamp = monthClamp;
  } else if (recurrenceType === "interval") {
    const intervalDays = Number(body.interval_days);
    if (!Number.isInteger(intervalDays) || intervalDays < 1) {
      return { error: "interval_days must be a positive integer" };
    }
    pattern.interval_days = intervalDays;
  } else {
    const count = Number(body.completion_offset_count);
    const unit = body.completion_offset_unit;
    if (!Number.isInteger(count) || count < 1) {
      return { error: "completion_offset_count must be a positive integer" };
    }
    if (typeof unit !== "string" || !(COMPLETION_OFFSET_UNITS as readonly string[]).includes(unit)) {
      return { error: "completion_offset_unit must be one of day, week, month, year" };
    }
    pattern.completion_offset_count = count;
    pattern.completion_offset_unit = unit;
  }

  return { pattern };
}

export type EndsFields = { ends_type: string; ends_date: string | null; ends_count: number | null };

/** Validates the Ends condition. Omitted body.ends_type defaults to "never" — the pre-Ends behavior. */
export function parseEnds(body: Record<string, unknown>): { ends: EndsFields } | { error: string } {
  if (body.ends_type === undefined) return { ends: { ends_type: "never", ends_date: null, ends_count: null } };

  const endsType = body.ends_type;
  if (typeof endsType !== "string" || !(ENDS_TYPES as readonly string[]).includes(endsType)) {
    return { error: "Invalid ends_type" };
  }
  if (endsType === "date") {
    if (typeof body.ends_date !== "string" || !body.ends_date) {
      return { error: "ends_date is required when ends_type is 'date'" };
    }
    return { ends: { ends_type: "date", ends_date: body.ends_date, ends_count: null } };
  }
  if (endsType === "count") {
    const count = Number(body.ends_count);
    if (!Number.isInteger(count) || count < 1) {
      return { error: "ends_count must be a positive integer when ends_type is 'count'" };
    }
    return { ends: { ends_type: "count", ends_date: null, ends_count: count } };
  }
  return { ends: { ends_type: "never", ends_date: null, ends_count: null } };
}
