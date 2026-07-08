"use client";

import { useState } from "react";
import { computeStreak, type Habit as StreakHabit } from "@/lib/habits/streaks";
import ColorPicker from "@/components/color-picker";

export type HabitFrequency = "daily" | "specific_days" | "times_per_week";

export type Habit = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  frequency: HabitFrequency;
  frequency_days: number[] | null;
  target_count: number | null;
  active: boolean;
};

export type HabitLogRow = {
  id: string;
  habit_id: string;
  logged_date: string;
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
  onToggle,
  onUpdate,
  onDelete,
}: {
  habit: Habit;
  logs: HabitLogRow[];
  today: string;
  onToggle: (habit: Habit, loggedToday: boolean) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(habit.name);
  const [color, setColor] = useState(habit.color);
  const [frequency, setFrequency] = useState<HabitFrequency>(habit.frequency);
  const [frequencyDays, setFrequencyDays] = useState<number[]>(
    habit.frequency_days ?? [],
  );
  const [targetCount, setTargetCount] = useState(habit.target_count ?? 3);

  const loggedToday = logs.some((l) => l.logged_date === today);
  const { current, longest } = computeStreak(habit as StreakHabit, logs, today);

  function startEdit() {
    setName(habit.name);
    setColor(habit.color);
    setFrequency(habit.frequency);
    setFrequencyDays(habit.frequency_days ?? []);
    setTargetCount(habit.target_count ?? 3);
    setEditing(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    onUpdate(habit.id, {
      name,
      color,
      frequency,
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
            <ColorPicker value={color} onChange={setColor} />
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
    <li className="flex items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <input
        type="checkbox"
        checked={loggedToday}
        onChange={() => onToggle(habit, loggedToday)}
      />
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: habit.color }}
      />
      <div className="flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {habit.name}
        </p>
        <p className="text-xs text-zinc-500">
          {habit.frequency.replace(/_/g, " ")}
          {habit.frequency === "times_per_week" ? ` (${habit.target_count}x/week)` : ""}
          {" · "}
          current streak {current}
          {habit.frequency === "times_per_week" ? " wk" : " day"}
          {current === 1 ? "" : "s"}
          {" · longest "}
          {longest}
          {habit.frequency === "times_per_week" ? " wk" : " day"}
          {longest === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex shrink-0 gap-3">
        <button
          onClick={startEdit}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(habit.id)}
          className="text-sm font-medium text-red-600 hover:text-red-700"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
