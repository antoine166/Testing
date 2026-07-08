"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { computeStreak, type Habit as StreakHabit } from "@/lib/habits/streaks";
import { todayLocal } from "@/lib/date";
import ColorPicker from "@/components/color-picker";

type HabitFrequency = "daily" | "specific_days" | "times_per_week";

type HabitLogRow = {
  id: string;
  habit_id: string;
  logged_date: string;
};

type Habit = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  frequency: HabitFrequency;
  frequency_days: number[] | null;
  target_count: number | null;
  active: boolean;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FREQUENCIES: HabitFrequency[] = ["daily", "specific_days", "times_per_week"];

function FrequencyFields({
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

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#10b981");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");
  const [frequencyDays, setFrequencyDays] = useState<number[]>([]);
  const [targetCount, setTargetCount] = useState(3);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#10b981");
  const [editFrequency, setEditFrequency] = useState<HabitFrequency>("daily");
  const [editFrequencyDays, setEditFrequencyDays] = useState<number[]>([]);
  const [editTargetCount, setEditTargetCount] = useState(3);

  const today = todayLocal();

  async function loadAll() {
    try {
      const [habitsRes, logsRes] = await Promise.all([
        fetch("/api/habits"),
        fetch("/api/habit-logs"),
      ]);
      if (!habitsRes.ok || !logsRes.ok) {
        throw new Error("Failed to load habits");
      }
      setHabits(await habitsRes.json());
      setLogs(await logsRes.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };

    Promise.all([fetch("/api/habits", opts), fetch("/api/habit-logs", opts)])
      .then(async ([habitsRes, logsRes]) => {
        if (!habitsRes.ok || !logsRes.ok) {
          throw new Error("Failed to load habits");
        }
        return Promise.all([habitsRes.json(), logsRes.json()]);
      })
      .then(([habitsData, logsData]) => {
        setHabits(habitsData);
        setLogs(logsData);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;

    const res = await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        color,
        frequency,
        frequency_days: frequency === "specific_days" ? frequencyDays : null,
        target_count: frequency === "times_per_week" ? targetCount : null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create habit");
      return;
    }

    setName("");
    setColor("#10b981");
    setFrequency("daily");
    setFrequencyDays([]);
    setTargetCount(3);
    await loadAll();
  }

  function startEdit(habit: Habit) {
    setEditingId(habit.id);
    setEditName(habit.name);
    setEditColor(habit.color);
    setEditFrequency(habit.frequency);
    setEditFrequencyDays(habit.frequency_days ?? []);
    setEditTargetCount(habit.target_count ?? 3);
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;

    const res = await fetch(`/api/habits/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        color: editColor,
        frequency: editFrequency,
        frequency_days: editFrequency === "specific_days" ? editFrequencyDays : null,
        target_count: editFrequency === "times_per_week" ? editTargetCount : null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update habit");
      return;
    }

    setEditingId(null);
    await loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this habit? Its log history will be deleted too.")) return;

    const res = await fetch(`/api/habits/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete habit");
      return;
    }

    await loadAll();
  }

  async function toggleToday(habit: Habit, loggedToday: boolean) {
    const res = loggedToday
      ? await fetch(`/api/habit-logs?habit_id=${habit.id}&date=${today}`, {
          method: "DELETE",
        })
      : await fetch("/api/habit-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ habit_id: habit.id, date: today }),
        });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update log");
      return;
    }

    await loadAll();
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Habits
        </h1>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Back home
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              New habit
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Meditate"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Color
            </label>
            <div className="mt-1">
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>
          <div>
            <label
              htmlFor="frequency"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Frequency
            </label>
            <select
              id="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <FrequencyFields
          frequency={frequency}
          frequencyDays={frequencyDays}
          targetCount={targetCount}
          onFrequencyDaysChange={setFrequencyDays}
          onTargetCountChange={setTargetCount}
        />

        <button
          type="submit"
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : habits.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No habits yet. Add your first one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {habits.map((habit) => {
            const habitLogs = logs.filter((l) => l.habit_id === habit.id);
            const loggedToday = habitLogs.some((l) => l.logged_date === today);
            const { current, longest } = computeStreak(
              habit as StreakHabit,
              habitLogs,
              today,
            );

            if (editingId === habit.id) {
              return (
                <li
                  key={habit.id}
                  className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ColorPicker value={editColor} onChange={setEditColor} />
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <select
                        value={editFrequency}
                        onChange={(e) =>
                          setEditFrequency(e.target.value as HabitFrequency)
                        }
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
                      frequency={editFrequency}
                      frequencyDays={editFrequencyDays}
                      targetCount={editTargetCount}
                      onFrequencyDaysChange={setEditFrequencyDays}
                      onTargetCountChange={setEditTargetCount}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleUpdate(habit.id)}
                        className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
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
                key={habit.id}
                className="flex items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={loggedToday}
                  onChange={() => toggleToday(habit, loggedToday)}
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
                    {habit.frequency === "times_per_week"
                      ? ` (${habit.target_count}x/week)`
                      : ""}
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
                    onClick={() => startEdit(habit)}
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(habit.id)}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
