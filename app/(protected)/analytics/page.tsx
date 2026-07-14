"use client";

import { useEffect, useState } from "react";
import {
  computeStreak,
  isHabitDueToday,
  type Habit as StreakHabit,
} from "@/lib/habits/streaks";
import { todayLocal, lastNDays } from "@/lib/date";

type HabitFrequency = "daily" | "specific_days" | "times_per_week";

type Habit = {
  id: string;
  name: string;
  color: string;
  frequency: HabitFrequency;
  frequency_days: number[] | null;
  target_count: number | null;
  active: boolean;
  domain_id: string | null;
};

type Domain = { id: string; color: string };

type HabitLogRow = { id: string; habit_id: string; logged_date: string };

type Task = {
  id: string;
  status: "todo" | "in_progress" | "done";
  completed_at: string | null;
};

type Checkin = {
  date: string;
  energy_level: number;
  focus_level: number;
};

const WINDOW_DAYS = 28;

export default function AnalyticsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function domainColor(habit: Habit): string {
    return domains.find((d) => d.id === habit.domain_id)?.color ?? "#d4d4d8";
  }

  const today = todayLocal();
  const days = lastNDays(WINDOW_DAYS);
  const last7 = lastNDays(7);

  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };

    Promise.all([
      fetch("/api/habits", opts),
      fetch("/api/habit-logs", opts),
      fetch("/api/tasks", opts),
      fetch("/api/checkins", opts),
      fetch("/api/domains", opts),
    ])
      .then(async ([habitsRes, logsRes, tasksRes, checkinsRes, domainsRes]) => {
        if (!habitsRes.ok || !logsRes.ok || !tasksRes.ok || !checkinsRes.ok || !domainsRes.ok) {
          throw new Error("Failed to load analytics");
        }
        return Promise.all([
          habitsRes.json(),
          logsRes.json(),
          tasksRes.json(),
          checkinsRes.json(),
          domainsRes.json(),
        ]);
      })
      .then(([habitsData, logsData, tasksData, checkinsData, domainsData]) => {
        setHabits(habitsData);
        setLogs(logsData);
        setTasks(tasksData);
        setCheckins(checkinsData);
        setDomains(domainsData);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  const tasksCompletedThisWeek = tasks.filter(
    (t) => t.completed_at && last7.includes(t.completed_at.slice(0, 10)),
  ).length;

  const tasksCompletedByDay = Array.from(
    tasks.reduce((counts, t) => {
      if (!t.completed_at) return counts;
      const day = t.completed_at.slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  ).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const maxDailyTaskCount = Math.max(1, ...tasksCompletedByDay.map(([, count]) => count));

  const checkinsThisWeek = checkins.filter((c) => last7.includes(c.date));
  const avgEnergy = checkinsThisWeek.length
    ? (
        checkinsThisWeek.reduce((sum, c) => sum + c.energy_level, 0) /
        checkinsThisWeek.length
      ).toFixed(1)
    : null;
  const avgFocus = checkinsThisWeek.length
    ? (
        checkinsThisWeek.reduce((sum, c) => sum + c.focus_level, 0) /
        checkinsThisWeek.length
      ).toFixed(1)
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Analytics
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mb-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          This week
        </h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {tasksCompletedThisWeek}
            </p>
            <p className="text-xs text-zinc-500">tasks done</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {checkinsThisWeek.length}/7
            </p>
            <p className="text-xs text-zinc-500">days checked in</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {avgEnergy ?? "—"} / {avgFocus ?? "—"}
            </p>
            <p className="text-xs text-zinc-500">avg energy / focus</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Tasks completed per day (all time)
        </h2>
        {tasksCompletedByDay.length === 0 ? (
          <p className="text-sm text-zinc-500">No completed tasks yet.</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            {tasksCompletedByDay.map(([day, count]) => (
              <div key={day} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-zinc-500">{day}</span>
                <div className="h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${(count / maxDailyTaskCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-zinc-700 dark:text-zinc-300">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Habit consistency (last {WINDOW_DAYS} days)
      </h2>

      {habits.filter((h) => h.active).length === 0 ? (
        <p className="text-sm text-zinc-500">No active habits yet.</p>
      ) : (
        <ul className="space-y-4">
          {habits
            .filter((h) => h.active)
            .map((habit) => {
              const habitLogs = logs.filter((l) => l.habit_id === habit.id);
              const loggedDates = new Set(habitLogs.map((l) => l.logged_date));
              const { current, longest } = computeStreak(
                habit as StreakHabit,
                habitLogs,
                today,
              );

              const requiredDays = days.filter((d) =>
                isHabitDueToday(habit as StreakHabit, d),
              );
              const loggedRequiredDays = requiredDays.filter((d) => loggedDates.has(d));
              const denominator =
                habit.frequency === "times_per_week"
                  ? (habit.target_count ?? 1) * (WINDOW_DAYS / 7)
                  : requiredDays.length;
              const rate = denominator
                ? Math.round((loggedRequiredDays.length / denominator) * 100)
                : 0;

              return (
                <li
                  key={habit.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: domainColor(habit) }}
                      />
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {habit.name}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {rate}% · streak {current} · best {longest} · {habitLogs.length} all-time
                    </p>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {days.map((d) => (
                      <div
                        key={d}
                        title={d}
                        className={`h-4 w-4 rounded-sm sm:h-5 sm:w-5 ${
                          loggedDates.has(d) ? "" : "bg-zinc-100 dark:bg-zinc-900"
                        }`}
                        style={loggedDates.has(d) ? { backgroundColor: domainColor(habit) } : undefined}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
