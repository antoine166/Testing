"use client";

import { DAY_LABELS, type RecurrenceType } from "@/lib/recurring-tasks/types";

type Props = {
  recurrenceType: RecurrenceType;
  onRecurrenceTypeChange: (type: RecurrenceType) => void;
  daysOfWeek: number[];
  onToggleDay: (day: number) => void;
  dayOfMonth: number;
  onDayOfMonthChange: (day: number) => void;
  intervalDays: number;
  onIntervalDaysChange: (days: number) => void;
};

/** The recurrence-pattern picker shown under "Make this recurring," shared by every task create form (Tasks, Inbox, Today). */
export default function RecurrenceFields({
  recurrenceType,
  onRecurrenceTypeChange,
  daysOfWeek,
  onToggleDay,
  dayOfMonth,
  onDayOfMonthChange,
  intervalDays,
  onIntervalDaysChange,
}: Props) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-3">
        <select
          value={recurrenceType}
          onChange={(e) => onRecurrenceTypeChange(e.target.value as RecurrenceType)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="interval">Every N days</option>
        </select>

        {recurrenceType === "weekly" && (
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onToggleDay(i)}
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
              onChange={(e) => onDayOfMonthChange(Number(e.target.value))}
              className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        )}

        {recurrenceType === "interval" && (
          <label className="flex items-center gap-2 text-sm text-zinc-500">
            Every
            <input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => onIntervalDaysChange(Number(e.target.value))}
              className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            days
          </label>
        )}
      </div>
      {recurrenceType === "weekly" && daysOfWeek.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Pick at least one day.</p>
      )}
    </div>
  );
}
