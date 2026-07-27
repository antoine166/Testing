"use client";

import { useEffect, useState } from "react";
import {
  computeStreak,
  isHabitDueToday,
  type Habit as StreakHabit,
} from "@/lib/habits/streaks";
import { findStalledProjectIds } from "@/lib/projects/stalled";
import { reviewStreakWeeks } from "@/lib/reviews/streak";
import { todayLocal, lastNDays, daysSince } from "@/lib/date";
import { isInInbox } from "@/lib/tasks/inbox";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

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
  created_at: string;
  clarified_at: string | null;
  domain_id: string | null;
  project_id: string | null;
  someday: boolean;
  waiting_for: boolean;
};

type Project = { id: string; status: string; parent_project_id: string | null };

type ReviewLog = { completed_at: string };

type Checkin = {
  date: string;
  energy_level: number;
  focus_level: number;
};

type Workout = { id: string; name: string };

type WorkoutLogAttachment = { id: string; filename: string; url: string | null };

type WorkoutLog = {
  id: string;
  workout_id: string;
  logged_date: string;
  duration_minutes: number | null;
  notes: string | null;
  attachments: WorkoutLogAttachment[];
};

const WINDOW_OPTIONS = [28, 90, 365] as const;

export default function AnalyticsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [reviewLogs, setReviewLogs] = useState<ReviewLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<(typeof WINDOW_OPTIONS)[number]>(28);

  function domainColor(habit: Habit): string {
    return domains.find((d) => d.id === habit.domain_id)?.color ?? "#d4d4d8";
  }

  const today = todayLocal();
  const days = lastNDays(windowDays);
  const last7 = lastNDays(7);

  async function loadAll(signal?: AbortSignal) {
    try {
      const opts = { signal };
      const [habitsRes, logsRes, tasksRes, checkinsRes, domainsRes, workoutsRes, workoutLogsRes, projectsRes, reviewLogsRes] =
        await Promise.all([
          fetch("/api/habits", opts),
          fetch("/api/habit-logs", opts),
          fetch("/api/tasks", opts),
          fetch("/api/checkins", opts),
          fetch("/api/domains", opts),
          fetch("/api/workouts", opts),
          fetch("/api/workout-logs", opts),
          fetch("/api/projects", opts),
          fetch("/api/weekly-review-logs", opts),
        ]);
      if (
        !habitsRes.ok ||
        !logsRes.ok ||
        !tasksRes.ok ||
        !checkinsRes.ok ||
        !domainsRes.ok ||
        !workoutsRes.ok ||
        !workoutLogsRes.ok ||
        !projectsRes.ok
      ) {
        throw new Error("Failed to load analytics");
      }
      setHabits(await habitsRes.json());
      setLogs(await logsRes.json());
      setTasks(await tasksRes.json());
      setCheckins(await checkinsRes.json());
      setDomains(await domainsRes.json());
      setWorkouts(await workoutsRes.json());
      setWorkoutLogs(await workoutLogsRes.json());
      setProjects(await projectsRes.json());
      setReviewLogs(reviewLogsRes.ok ? await reviewLogsRes.json() : []);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };

    Promise.all([
      fetch("/api/habits", opts),
      fetch("/api/habit-logs", opts),
      fetch("/api/tasks", opts),
      fetch("/api/checkins", opts),
      fetch("/api/domains", opts),
      fetch("/api/workouts", opts),
      fetch("/api/workout-logs", opts),
      fetch("/api/projects", opts),
      fetch("/api/weekly-review-logs", opts),
    ])
      .then(async ([habitsRes, logsRes, tasksRes, checkinsRes, domainsRes, workoutsRes, workoutLogsRes, projectsRes, reviewLogsRes]) => {
        if (
          !habitsRes.ok ||
          !logsRes.ok ||
          !tasksRes.ok ||
          !checkinsRes.ok ||
          !domainsRes.ok ||
          !workoutsRes.ok ||
          !workoutLogsRes.ok ||
          !projectsRes.ok
        ) {
          throw new Error("Failed to load analytics");
        }
        return Promise.all([
          habitsRes.json(),
          logsRes.json(),
          tasksRes.json(),
          checkinsRes.json(),
          domainsRes.json(),
          workoutsRes.json(),
          workoutLogsRes.json(),
          projectsRes.json(),
          reviewLogsRes.ok ? reviewLogsRes.json() : [],
        ]);
      })
      .then(([habitsData, logsData, tasksData, checkinsData, domainsData, workoutsData, workoutLogsData, projectsData, reviewLogsData]) => {
        setHabits(habitsData);
        setLogs(logsData);
        setTasks(tasksData);
        setCheckins(checkinsData);
        setDomains(domainsData);
        setWorkouts(workoutsData);
        setWorkoutLogs(workoutLogsData);
        setProjects(projectsData);
        setReviewLogs(reviewLogsData);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  useRealtimeRefresh(
    ["habits", "habit_logs", "tasks", "daily_checkins", "domains", "workouts", "workout_logs", "projects", "weekly_review_logs"],
    () => loadAll(),
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  // --- System trust: is GTD actually being practiced, or just installed? ---
  // Capture→clarify latency over the window; median, because one item that
  // sat for a month shouldn't swamp the story.
  const clarifyLatenciesHours = tasks
    .filter(
      (t) =>
        t.clarified_at &&
        days.includes(t.clarified_at.slice(0, 10)),
    )
    .map(
      (t) =>
        (new Date(t.clarified_at!).getTime() - new Date(t.created_at).getTime()) /
        (1000 * 60 * 60),
    )
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const medianClarifyHours = clarifyLatenciesHours.length
    ? clarifyLatenciesHours[Math.floor(clarifyLatenciesHours.length / 2)]
    : null;
  const clarifyLabel =
    medianClarifyHours === null
      ? "—"
      : medianClarifyHours < 1
        ? "<1h"
        : medianClarifyHours < 48
          ? `${Math.round(medianClarifyHours)}h`
          : `${Math.round(medianClarifyHours / 24)}d`;

  const inboxTasks = tasks.filter((t) => isInInbox(t, today));
  const oldestInboxDays = inboxTasks.length
    ? Math.max(...inboxTasks.map((t) => daysSince(t.created_at.slice(0, 10))))
    : null;

  const stalledCount = findStalledProjectIds(
    projects,
    tasks.map((t) => ({ project_id: t.project_id, status: t.status })),
  ).size;

  const reviewStreak = reviewStreakWeeks(
    reviewLogs.map((l) => l.completed_at),
    today,
  );
  const lastReviewDays = reviewLogs[0]
    ? daysSince(reviewLogs[0].completed_at.slice(0, 10))
    : null;

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
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          System trust
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Is the system being practiced, or just installed? These four say.
        </p>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div>
            <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{clarifyLabel}</p>
            <p className="text-xs text-zinc-500">median capture→clarify</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {inboxTasks.length}
              {oldestInboxDays !== null && oldestInboxDays > 0 && (
                <span className="text-sm font-normal text-zinc-400"> · {oldestInboxDays}d old</span>
              )}
            </p>
            <p className="text-xs text-zinc-500">in Inbox (oldest)</p>
          </div>
          <div>
            <p
              className={`text-2xl font-semibold ${stalledCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-zinc-950 dark:text-zinc-50"}`}
            >
              {stalledCount}
            </p>
            <p className="text-xs text-zinc-500">stalled projects</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
              {reviewStreak}w
              {lastReviewDays !== null && (
                <span className="text-sm font-normal text-zinc-400"> · {lastReviewDays}d ago</span>
              )}
            </p>
            <p className="text-xs text-zinc-500">review streak (last)</p>
          </div>
        </div>
      </div>

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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Habit consistency (last {windowDays} days)
        </h2>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value) as (typeof WINDOW_OPTIONS)[number])}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          {WINDOW_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </select>
      </div>

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
                  ? (habit.target_count ?? 1) * (windowDays / 7)
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
                  <div className="overflow-x-auto">
                    <div
                      className={`grid grid-flow-col grid-rows-7 gap-1 ${windowDays > 90 ? "w-max" : ""}`}
                    >
                      {days.map((d) => (
                        <div
                          key={d}
                          title={d}
                          className={`rounded-sm ${windowDays > 90 ? "h-2.5 w-2.5" : "h-4 w-4 sm:h-5 sm:w-5"} ${
                            loggedDates.has(d) ? "" : "bg-zinc-100 dark:bg-zinc-900"
                          }`}
                          style={loggedDates.has(d) ? { backgroundColor: domainColor(habit) } : undefined}
                        />
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Workouts
      </h2>
      {workoutLogs.length === 0 ? (
        <p className="text-sm text-zinc-500">No training logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {workoutLogs
            .slice()
            .sort((a, b) => b.logged_date.localeCompare(a.logged_date))
            .map((log) => {
              const workoutName =
                workouts.find((w) => w.id === log.workout_id)?.name ?? "(deleted workout)";
              return (
                <li
                  key={log.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {workoutName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {log.logged_date}
                      {log.duration_minutes != null ? ` · ${log.duration_minutes} min` : ""}
                    </p>
                  </div>
                  {log.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                      {log.notes}
                    </p>
                  )}
                  {log.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {log.attachments.map((a) =>
                        a.url ? (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={a.url}
                              alt={a.filename}
                              className="h-14 w-14 rounded-md object-cover"
                            />
                          </a>
                        ) : null,
                      )}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
