"use client";

import {
  COMPLETION_OFFSET_UNITS,
  DAY_LABELS,
  MONTH_LABELS,
  WEEK_OF_MONTH_LABELS,
  type CompletionOffsetUnit,
  type EndsType,
  type MonthClamp,
  type RecurrenceType,
} from "@/lib/recurring-tasks/types";

/** Every recurrence-pattern + Ends field a template can have, in one controlled draft object — replaces one useState per field so both the create form and the edit-template form (app/(protected)/tasks/page.tsx) only need a single state slot each. */
export type RecurrencePatternDraft = {
  recurrence_type: RecurrenceType;
  days_of_week: number[];
  day_of_month: number;
  interval_days: number;
  month_of_year: number;
  week_of_month: number;
  weekday_of_month: number;
  month_clamp: MonthClamp;
  completion_offset_count: number;
  completion_offset_unit: CompletionOffsetUnit;
  ends_type: EndsType;
  ends_date: string;
  ends_count: number;
};

export const DEFAULT_RECURRENCE_PATTERN: RecurrencePatternDraft = {
  recurrence_type: "weekly",
  days_of_week: [],
  day_of_month: 1,
  interval_days: 7,
  month_of_year: 1,
  week_of_month: 1,
  weekday_of_month: 1,
  month_clamp: "clamp",
  completion_offset_count: 1,
  completion_offset_unit: "day",
  ends_type: "never",
  ends_date: "",
  ends_count: 1,
};

const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  weekly: "Weekly",
  monthly: "Monthly (day of month)",
  monthly_nth_weekday: "Monthly (nth weekday)",
  yearly: "Yearly",
  interval: "Every N days",
  completion: "After completion",
};

const selectClass =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const numberClass =
  "w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type Props = {
  pattern: RecurrencePatternDraft;
  onChange: (updates: Partial<RecurrencePatternDraft>) => void;
};

/** The recurrence-pattern + Ends picker shown under "Make this recurring," shared by every task create/edit form (Tasks, Inbox). Things 3's Repeat sheet is the closest reference point: a type picker, type-specific fields, and an Ends condition. */
export default function RecurrenceFields({ pattern, onChange }: Props) {
  const {
    recurrence_type: recurrenceType,
    days_of_week: daysOfWeek,
    day_of_month: dayOfMonth,
    interval_days: intervalDays,
    month_of_year: monthOfYear,
    week_of_month: weekOfMonth,
    weekday_of_month: weekdayOfMonth,
    month_clamp: monthClamp,
    completion_offset_count: completionOffsetCount,
    completion_offset_unit: completionOffsetUnit,
    ends_type: endsType,
    ends_date: endsDate,
    ends_count: endsCount,
  } = pattern;

  function toggleDay(day: number) {
    onChange({
      days_of_week: daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day],
    });
  }

  const usesMonthClamp = recurrenceType === "monthly" || recurrenceType === "yearly";

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-3">
        <select
          value={recurrenceType}
          onChange={(e) => onChange({ recurrence_type: e.target.value as RecurrenceType })}
          className={selectClass}
        >
          {(Object.keys(RECURRENCE_TYPE_LABELS) as RecurrenceType[]).map((type) => (
            <option key={type} value={type}>
              {RECURRENCE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        {recurrenceType === "weekly" && (
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`rounded-md border px-2 py-1 text-xs font-medium ${
                  daysOfWeek.includes(i)
                    ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                    : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {recurrenceType === "monthly" && (
          <label className="flex items-center gap-2 text-sm text-zinc-500">
            Day of month
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => onChange({ day_of_month: Number(e.target.value) })}
              className={numberClass}
            />
          </label>
        )}

        {recurrenceType === "monthly_nth_weekday" && (
          <>
            <select
              value={weekOfMonth}
              onChange={(e) => onChange({ week_of_month: Number(e.target.value) })}
              className={selectClass}
            >
              {[1, 2, 3, 4, 5, -1].map((w) => (
                <option key={w} value={w}>
                  {w === -1 ? "Last" : WEEK_OF_MONTH_LABELS[w]}
                </option>
              ))}
            </select>
            <select
              value={weekdayOfMonth}
              onChange={(e) => onChange({ weekday_of_month: Number(e.target.value) })}
              className={selectClass}
            >
              {DAY_LABELS.map((label, i) => (
                <option key={i} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </>
        )}

        {recurrenceType === "yearly" && (
          <>
            <select
              value={monthOfYear}
              onChange={(e) => onChange({ month_of_year: Number(e.target.value) })}
              className={selectClass}
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={i} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              Day
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => onChange({ day_of_month: Number(e.target.value) })}
                className={numberClass}
              />
            </label>
          </>
        )}

        {recurrenceType === "interval" && (
          <label className="flex items-center gap-2 text-sm text-zinc-500">
            Every
            <input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => onChange({ interval_days: Number(e.target.value) })}
              className={numberClass}
            />
            days
          </label>
        )}

        {recurrenceType === "completion" && (
          <label className="flex items-center gap-2 text-sm text-zinc-500">
            <input
              type="number"
              min={1}
              value={completionOffsetCount}
              onChange={(e) => onChange({ completion_offset_count: Number(e.target.value) })}
              className={numberClass}
            />
            <select
              value={completionOffsetUnit}
              onChange={(e) => onChange({ completion_offset_unit: e.target.value as CompletionOffsetUnit })}
              className={selectClass}
            >
              {COMPLETION_OFFSET_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                  {completionOffsetCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            after completion
          </label>
        )}
      </div>

      {recurrenceType === "weekly" && daysOfWeek.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Pick at least one day.</p>
      )}

      {usesMonthClamp && (
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={monthClamp === "roll"}
            onChange={(e) => onChange({ month_clamp: e.target.checked ? "roll" : "clamp" })}
          />
          If the day doesn&apos;t exist in a given month, roll to the 1st of the next month instead of
          using that month&apos;s last day
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-2 text-sm text-zinc-500 dark:border-zinc-800">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Ends</span>
        <select
          value={endsType}
          onChange={(e) => onChange({ ends_type: e.target.value as EndsType })}
          className={selectClass}
        >
          <option value="never">Never</option>
          <option value="date">On date</option>
          <option value="count">After N occurrences</option>
        </select>
        {endsType === "date" && (
          <input
            type="date"
            value={endsDate}
            onChange={(e) => onChange({ ends_date: e.target.value })}
            className={selectClass}
          />
        )}
        {endsType === "count" && (
          <input
            type="number"
            min={1}
            value={endsCount}
            onChange={(e) => onChange({ ends_count: Number(e.target.value) })}
            className={numberClass}
          />
        )}
      </div>
    </div>
  );
}
