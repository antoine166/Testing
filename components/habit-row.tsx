"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeStreak,
  countThisWeek,
  isAtRisk,
  type Habit as StreakHabit,
  type HabitFrequency,
} from "@/lib/habits/streaks";
import { lastSevenDays } from "@/lib/date";
import type { RemovalKind } from "@/components/leave-transition";
import { tapHaptic } from "@/lib/haptics";

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

/** The log control: a ring that sweeps to its fill (0→full for daily/
 *  specific-days; proportional to the weekly target for times_per_week).
 *  On a fresh log it gets *punched* in — a fist lands on the ring with an
 *  impact burst — a habit-specific reward, distinct from a task's checkmark.
 *  Replaces the plain checkbox. */
function HabitRing({
  fraction,
  celebrate,
  onClick,
  label,
}: {
  fraction: number;
  celebrate: boolean;
  onClick: () => void;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const full = clamped >= 1;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={full}
      className="relative shrink-0"
    >
      <svg width="26" height="26" viewBox="0 0 26 26" className="-rotate-90">
        <circle
          cx="13"
          cy="13"
          r={RING_R}
          fill="none"
          strokeWidth="2.5"
          className="stroke-zinc-200 dark:stroke-zinc-700"
        />
        <circle
          cx="13"
          cy="13"
          r={RING_R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="habit-ring-progress stroke-emerald-500"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - clamped)}
        />
      </svg>
      {full && !celebrate && (
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-emerald-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12l5 5L20 6" />
        </svg>
      )}
      {celebrate && (
        <>
          {/* Impact burst: an emerald ring that expands and fades on landing. */}
          <span className="habit-burst pointer-events-none absolute inset-0 m-auto rounded-full border-2 border-emerald-400" />
          {/* The fist, punching in and landing on the ring. */}
          <span className="habit-punch pointer-events-none absolute inset-0 z-10 m-auto flex items-center justify-center text-lg leading-none">
            👊
          </span>
        </>
      )}
    </button>
  );
}

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
  leaving,
}: {
  habit: Habit;
  logs: HabitLogRow[];
  today: string;
  domains?: HabitDomain[];
  /** Set on the snapshot row rendered while a cleared habit's space collapses out of the Today list (#121) — see components/leave-transition.tsx. */
  leaving?: RemovalKind;
  /** `date` defaults to today from callers, but any date lets the week's checkbox row log/unlog past days too. */
  onToggle: (habit: Habit, date: string, loggedOnDate: boolean) => void;
  /** times_per_week "extra credit" only: logs one more instance for today once the week's target is already hit. */
  onAddLog: (habit: Habit, date: string) => void;
  /** times_per_week "extra credit" only: removes the most recently added log for today. */
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
  // Drives the punch-in reward (fist + burst + row flash) while a fresh log
  // lands. Distinct from pendingAdd (which just holds the optimistic fill).
  const [celebrate, setCelebrate] = useState(false);
  // Optimistic "just logged" state so the ring fills and pops the instant
  // it's tapped — the actual save (onToggle) is deferred, because on the
  // Today view (and the Habits page's pending section) a logged habit is
  // filtered out and its row unmounts the moment the log lands. Without
  // this the animation never got a frame on screen. Mirrors TaskRow's
  // deferred-commit completion trick.
  const [pendingAdd, setPendingAdd] = useState(false);
  const popTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (popTimeoutRef.current) clearTimeout(popTimeoutRef.current);
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
      // A fast unmount (row dropped before the deferred save ran) must still
      // commit the log, or the tap would be silently lost.
      pendingCommitRef.current?.();
    };
  }, []);

  // Once the committed data reflects the add, drop the optimistic flag — the
  // real fraction now matches, so there's no visual change (relevant only on
  // views that keep the row mounted, e.g. a habit's own day row). Done as a
  // render-time adjustment (React's "reset state on prop change" pattern)
  // rather than an effect, so there's no extra render or flicker.
  const [wasLoggedToday, setWasLoggedToday] = useState(loggedToday);
  if (loggedToday !== wasLoggedToday) {
    setWasLoggedToday(loggedToday);
    if (loggedToday && pendingAdd) setPendingAdd(false);
  }

  const committedFraction =
    habit.frequency === "times_per_week"
      ? weekCount / (habit.target_count ?? 1)
      : loggedToday
        ? 1
        : 0;
  const optimisticFraction =
    habit.frequency === "times_per_week"
      ? (weekCount + 1) / (habit.target_count ?? 1)
      : 1;
  const ringFraction = pendingAdd ? optimisticFraction : committedFraction;

  function handleRingClick() {
    if (pendingAdd) return; // an add is mid-animation — ignore extra taps
    if (loggedToday) {
      // Un-logging today stays instant (no reward animation for undoing).
      onToggle(habit, today, true);
      return;
    }
    // Adding a log: fill the ring + punch it now, save ~750ms later so the
    // row survives long enough to show the reward before any filter unmounts
    // it. The punch/burst/flash run ~600ms.
    setPendingAdd(true);
    setCelebrate(true);
    tapHaptic();
    popTimeoutRef.current = setTimeout(() => setCelebrate(false), 650);
    const commit = () => {
      if (pendingCommitRef.current !== commit) return; // already committed
      pendingCommitRef.current = null;
      onToggle(habit, today, false);
    };
    pendingCommitRef.current = commit;
    commitTimeoutRef.current = setTimeout(commit, 750);
  }

  const domain = habit.domain_id ? domains.find((d) => d.id === habit.domain_id) : null;
  const displayColor = domain?.color ?? "#d4d4d8";
  const atRisk = isAtRisk(habit, logs, today);

  const loggedDates = new Set(logs.map((l) => l.logged_date));
  const recentDates = lastSevenDays(today);
  const requiredDates =
    habit.frequency === "specific_days"
      ? recentDates.filter((d) => (habit.frequency_days ?? []).includes(weekdayOf(d)))
      : recentDates;

  /** One day's cell in the daily/specific_days row and the times_per_week
   * day-picker — a plain per-day toggle, one log per day. */
  function renderDaySquare(date: string) {
    const isFuture = date > today;
    const isLogged = loggedDates.has(date);
    return (
      <button
        type="button"
        disabled={isFuture}
        onClick={() => onToggle(habit, date, isLogged)}
        aria-label={`${isLogged ? "Unlog" : "Log"} ${date}`}
        title={`${isLogged ? "Unlog" : "Log"} ${date}`}
        className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium sm:h-5 sm:w-5 ${
          isLogged
            ? "bg-emerald-500 text-white"
            : isFuture
              ? "cursor-default bg-zinc-100 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-700"
              : "border border-zinc-300 text-zinc-400 hover:border-emerald-400 dark:border-zinc-700"
        }`}
      >
        {DAY_LABELS[weekdayOf(date)][0]}
      </button>
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
      aria-hidden={leaving ? true : undefined}
      className={`flex items-center gap-3 rounded-md border px-4 py-3 ${
        leaving ? `row-leaving row-leaving-${leaving} ` : ""
      }${celebrate ? "habit-row-flash " : ""}${
        atRisk
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <HabitRing
        fraction={ringFraction}
        celebrate={celebrate}
        onClick={handleRingClick}
        label={loggedToday ? "Unlog today" : "Log today"}
      />
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: displayColor }}
      />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">
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
                    title={loggedToday ? "Unlog today" : "Log today"}
                    className={`h-6 w-6 rounded sm:h-5 sm:w-5 ${
                      i < weekCount
                        ? "bg-emerald-500"
                        : "border border-zinc-300 hover:border-emerald-400 dark:border-zinc-700"
                    }`}
                  />
                ))}
                {/* Extra credit: once the week's target is hit, each additional
                    log beyond it gets its own box here too — same green, no
                    separate "bonus" styling — plus a "+" to log another. */}
                {weekCount > (habit.target_count ?? 1) &&
                  Array.from({ length: weekCount - (habit.target_count ?? 1) }).map((_, i) => (
                    <button
                      key={`extra-${i}`}
                      type="button"
                      onClick={() => onRemoveLog(habit, today)}
                      aria-label="Remove extra credit"
                      title="Extra credit — you exceeded this week's target"
                      className="h-6 w-6 rounded bg-emerald-500 sm:h-5 sm:w-5"
                    />
                  ))}
                {weekCount >= (habit.target_count ?? 1) && (
                  <button
                    type="button"
                    onClick={() => onAddLog(habit, today)}
                    aria-label="Add extra credit for this week"
                    title="Did it again this week? Add extra credit."
                    className="flex h-6 w-6 items-center justify-center rounded border border-dashed border-zinc-300 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-600 sm:h-5 sm:w-5 dark:border-zinc-700 dark:hover:text-emerald-400"
                  >
                    +
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowDayRow((v) => !v)}
                aria-label={showDayRow ? "Hide day picker" : "Log a different day"}
                title={showDayRow ? "Hide day picker" : "Log a different day"}
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
                {recentDates.map((date) => (
                  <div key={date}>{renderDaySquare(date)}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1.5 flex gap-1">
            {requiredDates.map((date) => (
              <div key={date}>{renderDaySquare(date)}</div>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={startEdit}
          aria-label="Edit habit"
          title="Edit habit"
          className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 sm:h-7 sm:w-7 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(habit.id)}
          aria-label="Delete habit"
          title="Delete habit"
          className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 sm:h-7 sm:w-7 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>
    </li>
  );
}
