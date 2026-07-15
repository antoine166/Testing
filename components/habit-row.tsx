"use client";

import { useState } from "react";
import {
  computeStreak,
  countThisWeek,
  isAtRisk,
  type Habit as StreakHabit,
  type HabitFrequency,
} from "@/lib/habits/streaks";
import { daysOfWeek } from "@/lib/date";
import OverflowMenu from "@/components/overflow-menu";

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export type { HabitFrequency };

export type Habit = StreakHabit & {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  active: boolean;
  domain_id: string | null;
};

export type HabitDomain = { id: string; name: string; color: string };

export type HabitLogRow = {
  id: string;
  habit_id: string;
  logged_date: string;
  created_at: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "Extra credit" — a habit can be logged more than once in a day (e.g. two
// workouts), shown as extra squares next to the day's original one. Capped
// to keep the row from growing unbounded; enforced server-side too.
const MAX_LOGS_PER_DAY = 7;
export const FREQUENCIES: HabitFrequency[] = [
  "daily",
  "specific_days",
  "times_per_week",
];

export function FrequencyFields({
  frequency,
  frequencyDays,
  targetCount,
  onFrequencyDaysChange,
  onTargetCountChange,
}: {
  frequency: HabitFrequency;
  frequencyDays: number[];
  targetCount: number;
  onFrequencyDaysChange: (days: number[]) => void;
  onTargetCountChange: (count: number) => void;
}) {
  if (frequency === "specific_days") {
    return (
      <div className="flex flex-wrap gap-2">
        {DAY_LABELS.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() =>
              onFrequencyDaysChange(
                frequencyDays.includes(i)
                  ? frequencyDays.filter((d) => d !== i)
                  : [...frequencyDays, i],
              )
            }
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              frequencyDays.includes(i)
                ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (frequency === "times_per_week") {
    return (
      <input
        type="number"
        min={1}
        max={7}
        value={targetCount}
        onChange={(e) => onTargetCountChange(Number(e.target.value))}
        className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
    );
  }

  return null;
}

export default function HabitRow({
  habit,
  logs,
  today,
  domains = [],
  onToggle,
  onAddLog,
  onRemoveLog,
  onUpdate,
  onDelete,
}: {
  habit: Habit;
  logs: HabitLogRow[];
  today: string;
  domains?: HabitDomain[];
  /** `date` defaults to today from callers, but any date lets the week's checkbox row log/unlog past days too. */
  onToggle: (habit: Habit, date: string, loggedOnDate: boolean) => void;
  /** Adds one more log for a day that's already logged (extra credit), instead of toggling it off. */
  onAddLog: (habit: Habit, date: string) => void;
  /** Removes the most recently added log for a day, leaving any earlier ones (extra credit) in place. */
  onRemoveLog: (habit: Habit, date: string) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showDayRow, setShowDayRow] = useState(false);
  const [name, setName] = useState(habit.name);
  const [frequency, setFrequency] = useState<HabitFrequency>(habit.frequency);
  const [frequencyDays, setFrequencyDays] = useState<number[]>(
    habit.frequency_days ?? [],
  );
  const [targetCount, setTargetCount] = useState(habit.target_count ?? 3);
  const [domainId, setDomainId] = useState(habit.domain_id ?? "");

  const loggedToday = logs.some((l) => l.logged_date === today);
  const { current, longest } = computeStreak(habit, logs, today);
  const weekCount = habit.frequency === "times_per_week" ? countThisWeek(logs, today) : 0;
  const domain = habit.domain_id ? domains.find((d) => d.id === habit.domain_id) : null;
  const displayColor = domain?.color ?? "#d4d4d8";
  const atRisk = isAtRisk(habit, logs, today);

  const weekDates = daysOfWeek(today);
  const requiredDates =
    habit.frequency === "specific_days"
      ? weekDates.filter((d) => (habit.frequency_days ?? []).includes(weekdayOf(d)))
      : weekDates;

  const logsByDate = new Map<string, HabitLogRow[]>();
  for (const log of logs) {
    if (!logsByDate.has(log.logged_date)) logsByDate.set(log.logged_date, []);
    logsByDate.get(log.logged_date)!.push(log);
  }
  for (const dateLogs of logsByDate.values()) {
    dateLogs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /** One day's cell: a square per log that day (first light, rest darker
   * green for "extra credit"), plus a "+" to add another if under the cap. */
  function renderDaySquares(date: string) {
    const isFuture = date > today;
    const dateLogs = logsByDate.get(date) ?? [];
    const label = DAY_LABELS[weekdayOf(date)][0];

    if (dateLogs.length === 0) {
      return (
        <button
          type="button"
          disabled={isFuture}
          onClick={() => onToggle(habit, date, false)}
          title={date}
          aria-label={`Log ${date}`}
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium ${
            isFuture
              ? "cursor-default bg-zinc-100 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-700"
              : "border border-zinc-300 text-zinc-400 hover:border-emerald-400 dark:border-zinc-700"
          }`}
        >
          {label}
        </button>
      );
    }

    return (
      <div className="flex gap-0.5">
        {dateLogs.map((log, i) => (
          <button
            key={log.id}
            type="button"
            onClick={() => onRemoveLog(habit, date)}
            title={i === 0 ? date : `${date} — extra credit`}
            aria-label={i === 0 ? `Unlog ${date}` : `Remove extra credit for ${date}`}
            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium text-white ${
              i === 0 ? "bg-emerald-500" : "bg-emerald-800"
            }`}
          >
            {label}
          </button>
        ))}
        {dateLogs.length < MAX_LOGS_PER_DAY && (
          <button
            type="button"
            onClick={() => onAddLog(habit, date)}
            title={`Add extra credit for ${date}`}
            aria-label={`Add extra credit for ${date}`}
            className="flex h-5 w-5 items-center justify-center rounded border border-dashed border-zinc-300 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:hover:text-emerald-400"
          >
            +
          </button>
        )}
      </div>
    );
  }

  function startEdit() {
    setName(habit.name);
    setFrequency(habit.frequency);
    setFrequencyDays(habit.frequency_days ?? []);
    setTargetCount(habit.target_count ?? 3);
    setDomainId(habit.domain_id ?? "");
    setEditing(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    onUpdate(habit.id, {
      name,
      frequency,
      domain_id: domainId || null,
      frequency_days: frequency === "specific_days" ? frequencyDays : null,
      target_count: frequency === "times_per_week" ? targetCount : null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <FrequencyFields
            frequency={frequency}
            frequencyDays={frequencyDays}
            targetCount={targetCount}
            onFrequencyDaysChange={setFrequencyDays}
            onTargetCountChange={setTargetCount}
          />
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">No domain</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-center gap-3 rounded-md border px-4 py-3 ${
        atRisk
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <input
        type="checkbox"
        checked={loggedToday}
        onChange={() => onToggle(habit, today, loggedToday)}
      />
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: displayColor }}
      />
      <div className="flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {current > 0 && !atRisk && "🔥 "}
          {atRisk && "⚠️ "}
          {habit.name}
        </p>
        <p className="text-xs text-zinc-500">
          {habit.frequency.replace(/_/g, " ")}
          {habit.frequency === "times_per_week"
            ? ` (${weekCount}/${habit.target_count} this week)`
            : ""}
          {" · "}
          current streak {current}
          {habit.frequency === "times_per_week" ? " wk" : " day"}
          {current === 1 ? "" : "s"}
          {" · longest "}
          {longest}
          {habit.frequency === "times_per_week" ? " wk" : " day"}
          {longest === 1 ? "" : "s"}
          {domain ? ` · ${domain.name}` : ""}
        </p>
        {atRisk && (
          <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
            {habit.frequency === "times_per_week"
              ? `Running out of days — need ${(habit.target_count ?? 1) - weekCount} more this week`
              : "Missed last time — don’t break it twice"}
          </p>
        )}

        {habit.frequency === "times_per_week" ? (
          <div className="mt-1.5">
            <div className="flex items-center gap-1.5">
              <div className="flex gap-1">
                {Array.from({ length: habit.target_count ?? 1 }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onToggle(habit, today, loggedToday)}
                    aria-label={loggedToday ? "Unlog today" : "Log today"}
                    className={`h-5 w-5 rounded ${
                      i < weekCount
                        ? "bg-emerald-500"
                        : "border border-zinc-300 hover:border-emerald-400 dark:border-zinc-700"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowDayRow((v) => !v)}
                aria-label={showDayRow ? "Hide day picker" : "Log a different day"}
                aria-expanded={showDayRow}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <span
                  className={`inline-block transition-transform ${showDayRow ? "rotate-90" : ""}`}
                >
                  ›
                </span>
              </button>
            </div>
            {showDayRow && (
              <div className="mt-1.5 flex gap-1">
                {weekDates.map((date) => (
                  <div key={date}>{renderDaySquares(date)}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1.5 flex gap-1">
            {requiredDates.map((date) => (
              <div key={date}>{renderDaySquares(date)}</div>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <OverflowMenu
          items={[
            { label: "Edit", onClick: startEdit },
            { label: "Delete", onClick: () => onDelete(habit.id), destructive: true },
          ]}
        />
      </div>
    </li>
  );
}
