"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { todayLocal } from "@/lib/date";
import {
  computeStreak,
  isHabitDueToday,
  type Habit as StreakHabit,
} from "@/lib/habits/streaks";
import LevelPicker from "@/components/level-picker";

type Checkin = {
  date: string;
  energy_level: number;
  focus_level: number;
  notes: string | null;
} | null;

type HabitFrequency = "daily" | "specific_days" | "times_per_week";

type Habit = {
  id: string;
  name: string;
  color: string;
  frequency: HabitFrequency;
  frequency_days: number[] | null;
  target_count: number | null;
  active: boolean;
};

type HabitLogRow = {
  id: string;
  habit_id: string;
  logged_date: string;
};

type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "none" | "low" | "medium" | "high";

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  scheduled_date: string | null;
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export default function TodayDashboard() {
  const today = todayLocal();

  const [checkin, setCheckin] = useState<Checkin>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const [savingCheckin, setSavingCheckin] = useState(false);

  async function loadAll() {
    try {
      const [checkinRes, habitsRes, logsRes, tasksRes] = await Promise.all([
        fetch(`/api/checkins?date=${today}`),
        fetch("/api/habits"),
        fetch("/api/habit-logs"),
        fetch("/api/tasks"),
      ]);
      if (!checkinRes.ok || !habitsRes.ok || !logsRes.ok || !tasksRes.ok) {
        throw new Error("Failed to load today's data");
      }
      setCheckin(await checkinRes.json());
      setHabits(await habitsRes.json());
      setLogs(await logsRes.json());
      setTasks(await tasksRes.json());
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

    Promise.all([
      fetch(`/api/checkins?date=${today}`, opts),
      fetch("/api/habits", opts),
      fetch("/api/habit-logs", opts),
      fetch("/api/tasks", opts),
    ])
      .then(async ([checkinRes, habitsRes, logsRes, tasksRes]) => {
        if (!checkinRes.ok || !habitsRes.ok || !logsRes.ok || !tasksRes.ok) {
          throw new Error("Failed to load today's data");
        }
        return Promise.all([
          checkinRes.json(),
          habitsRes.json(),
          logsRes.json(),
          tasksRes.json(),
        ]);
      })
      .then(([checkinData, habitsData, logsData, tasksData]) => {
        setCheckin(checkinData);
        setHabits(habitsData);
        setLogs(logsData);
        setTasks(tasksData);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [today]);

  async function handleSaveCheckin() {
    if (!energyLevel || !focusLevel) {
      setError("Pick an energy and focus level");
      return;
    }

    setSavingCheckin(true);
    setError(null);

    const res = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        energy_level: energyLevel,
        focus_level: focusLevel,
      }),
    });

    setSavingCheckin(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save check-in");
      return;
    }

    await loadAll();
  }

  async function toggleHabit(habit: Habit, loggedToday: boolean) {
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
      setError(body.error ?? "Failed to update habit");
      return;
    }

    await loadAll();
  }

  async function toggleTask(task: Task) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: task.status === "done" ? "todo" : "done" }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update task");
      return;
    }

    await loadAll();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  const dueHabits = habits.filter((h) => h.active && isHabitDueToday(h, today));
  const todayTasks = [...tasks]
    .filter((t) => t.scheduled_date === today)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const overdueTasks = [...tasks]
    .filter((t) => t.scheduled_date && t.scheduled_date < today && t.status !== "done")
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {!checkin ? (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            How are you today?
          </h2>
          <div className="flex flex-wrap gap-6">
            <LevelPicker label="Energy" value={energyLevel} onChange={setEnergyLevel} />
            <LevelPicker label="Focus" value={focusLevel} onChange={setFocusLevel} />
          </div>
          <button
            onClick={handleSaveCheckin}
            disabled={savingCheckin}
            className="mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {savingCheckin ? "Saving..." : "Save check-in"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Checked in today — energy {checkin.energy_level}, focus{" "}
          {checkin.focus_level}.{" "}
          <Link href="/checkin" className="underline">
            Edit
          </Link>
        </p>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Habits today {dueHabits.length > 0 && `(${dueHabits.length})`}
        </h2>
        {dueHabits.length === 0 ? (
          <p className="text-sm text-zinc-500">No habits due today.</p>
        ) : (
          <ul className="space-y-2">
            {dueHabits.map((habit) => {
              const habitLogs = logs.filter((l) => l.habit_id === habit.id);
              const loggedToday = habitLogs.some((l) => l.logged_date === today);
              const { current } = computeStreak(
                habit as StreakHabit,
                habitLogs,
                today,
              );

              return (
                <li
                  key={habit.id}
                  className="flex items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                >
                  <input
                    type="checkbox"
                    checked={loggedToday}
                    onChange={() => toggleHabit(habit, loggedToday)}
                  />
                  <span
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: habit.color }}
                  />
                  <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">
                    {habit.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {current} {habit.frequency === "times_per_week" ? "wk" : "day"}
                    {current === 1 ? "" : "s"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Today {todayTasks.length > 0 && `(${todayTasks.length})`}
        </h2>
        {todayTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing scheduled for today.</p>
        ) : (
          <ul className="space-y-2">
            {todayTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => toggleTask(task)}
                />
                <span
                  className={`flex-1 text-sm text-zinc-900 dark:text-zinc-100 ${
                    task.status === "done" ? "line-through opacity-60" : ""
                  }`}
                >
                  {task.title}
                </span>
                <span className="text-xs text-zinc-500">{task.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {overdueTasks.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
            Overdue ({overdueTasks.length})
          </h2>
          <ul className="space-y-2">
            {overdueTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-md border border-red-200 px-4 py-3 dark:border-red-900"
              >
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => toggleTask(task)}
                />
                <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {task.title}
                </span>
                <span className="text-xs text-zinc-500">
                  was scheduled {task.scheduled_date}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-4 text-center">
        <Link
          href="/tasks"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          See all tasks →
        </Link>
      </div>
    </div>
  );
}
