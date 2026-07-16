"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { todayLocal } from "@/lib/date";
import { isAtRisk, isHabitDueToday, isPendingToday } from "@/lib/habits/streaks";
import { postHabitLog, deleteHabitLog } from "@/lib/habits/api";
import LevelPicker from "@/components/level-picker";
import HabitRow, { type Habit, type HabitLogRow } from "@/components/habit-row";
import TaskRow, {
  type Task,
  type TaskDomain,
  type TaskProject,
  type TaskPriority,
} from "@/components/task-row";
import { type Routine } from "@/components/routine-card";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

type Checkin = {
  date: string;
  energy_level: number;
  focus_level: number;
  notes: string | null;
} | null;

type RoutineItem = {
  id: string;
  routine_id: string;
  title: string;
  duration_minutes: number | null;
  sort_order: number;
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

function currentTimeOfDay(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

async function fetchDashboardData(today: string, opts?: RequestInit) {
  const [checkinRes, habitsRes, logsRes, tasksRes, domainsRes, projectsRes, routinesRes] =
    await Promise.all([
      fetch(`/api/checkins?date=${today}`, opts),
      fetch("/api/habits", opts),
      fetch("/api/habit-logs", opts),
      fetch("/api/tasks", opts),
      fetch("/api/domains", opts),
      fetch("/api/projects", opts),
      fetch("/api/routines", opts),
    ]);

  if (
    !checkinRes.ok ||
    !habitsRes.ok ||
    !logsRes.ok ||
    !tasksRes.ok ||
    !domainsRes.ok ||
    !projectsRes.ok ||
    !routinesRes.ok
  ) {
    throw new Error("Failed to load today's data");
  }

  const [checkin, habits, logs, tasks, domains, projects, routines] = await Promise.all([
    checkinRes.json(),
    habitsRes.json(),
    logsRes.json(),
    tasksRes.json(),
    domainsRes.json(),
    projectsRes.json(),
    routinesRes.json(),
  ]);

  return { checkin, habits, logs, tasks, domains, projects, routines };
}

export default function TodayDashboard() {
  const today = todayLocal();

  const [checkin, setCheckin] = useState<Checkin>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<TaskDomain[]>([]);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineItems, setRoutineItems] = useState<Record<string, RoutineItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const [savingCheckin, setSavingCheckin] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  async function loadAll() {
    try {
      const data = await fetchDashboardData(today);
      setCheckin(data.checkin);
      setHabits(data.habits);
      setLogs(data.logs);
      setTasks(data.tasks);
      setDomains(data.domains);
      setProjects(data.projects);
      setRoutines(data.routines);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    fetchDashboardData(today, { signal: controller.signal })
      .then((data) => {
        setCheckin(data.checkin);
        setHabits(data.habits);
        setLogs(data.logs);
        setTasks(data.tasks);
        setDomains(data.domains);
        setProjects(data.projects);
        setRoutines(data.routines);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [today]);

  useRealtimeRefresh(
    [
      "daily_checkins",
      "habits",
      "habit_logs",
      "tasks",
      "domains",
      "projects",
      "routines",
      "routine_items",
    ],
    () => loadAll(),
  );

  useEffect(() => {
    const controller = new AbortController();
    const relevant = routines.filter(
      (r) => r.active && (r.time_of_day === currentTimeOfDay() || r.time_of_day === "custom"),
    );

    if (relevant.length === 0) return;

    Promise.all(
      relevant.map((r) =>
        fetch(`/api/routines/${r.id}/items`, { signal: controller.signal }).then((res) =>
          res.ok ? res.json() : [],
        ),
      ),
    )
      .then((results: RoutineItem[][]) => {
        const byRoutine: Record<string, RoutineItem[]> = {};
        relevant.forEach((r, i) => {
          byRoutine[r.id] = results[i];
        });
        setRoutineItems(byRoutine);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [routines]);

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

  async function addHabitLog(habit: Habit, date: string) {
    const result = await postHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadAll();
  }

  async function removeHabitLog(habit: Habit, date: string) {
    const result = await deleteHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadAll();
  }

  async function toggleHabit(habit: Habit, date: string, loggedOnDate: boolean) {
    if (loggedOnDate) {
      await removeHabitLog(habit, date);
    } else {
      await addHabitLog(habit, date);
    }
  }

  async function handleUpdateHabit(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/habits/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update habit");
      return;
    }

    await loadAll();
  }

  async function handleDeleteHabit(id: string) {
    if (!confirm("Move this habit to trash? You can restore it, with its log history, within 30 days.")) return;

    const res = await fetch(`/api/habits/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete habit");
      return;
    }

    await loadAll();
  }

  async function handleUpdateTask(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update task");
      return;
    }

    await loadAll();
  }

  async function toggleTask(task: Task) {
    await handleUpdateTask(task.id, {
      status: task.status === "done" ? "todo" : "done",
    });
  }

  async function handleDeleteTask(id: string) {
    if (!confirm("Move this task to trash? You can restore it within 30 days.")) return;

    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete task");
      return;
    }

    await loadAll();
  }

  async function handleCreateTask(title: string) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, scheduled_date: today }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return false;
    }

    await loadAll();
    return true;
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  const dueRoutines = routines.filter(
    (r) => r.active && (r.time_of_day === currentTimeOfDay() || r.time_of_day === "custom"),
  );
  const dueHabits = habits
    .filter((h) => h.active && isHabitDueToday(h, today))
    .sort((a, b) => {
      // Not-done-yet-today habits rise above ones already checked off, and
      // at-risk ones ("don't break it twice") surface first within that.
      const aLogs = logs.filter((l) => l.habit_id === a.id);
      const bLogs = logs.filter((l) => l.habit_id === b.id);
      const rank = (h: Habit, hLogs: HabitLogRow[]) =>
        !isPendingToday(h, hLogs, today) ? 2 : isAtRisk(h, hLogs, today) ? 0 : 1;
      return rank(a, aLogs) - rank(b, bLogs);
    });
  const atRiskCount = dueHabits.filter((h) =>
    isAtRisk(h, logs.filter((l) => l.habit_id === h.id), today),
  ).length;
  const todayTasks = [...tasks]
    .filter((t) => t.scheduled_date === today && t.status !== "done")
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

      {dueRoutines.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Routines
          </h2>
          <div className="space-y-3">
            {dueRoutines.map((routine) => (
              <div
                key={routine.id}
                className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {routine.name}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {(routineItems[routine.id] ?? []).map((item) => (
                    <li key={item.id} className="text-xs text-zinc-500">
                      {item.title}
                      {item.duration_minutes ? ` (${item.duration_minutes} min)` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <details open className="group">
        <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
          Habits today {dueHabits.length > 0 && `(${dueHabits.length})`}
        </summary>
        {atRiskCount > 0 && (
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-500">
            ⚠️ {atRiskCount} at risk of breaking a streak twice in a row — do these first
          </p>
        )}
        {dueHabits.length === 0 ? (
          <p className="text-sm text-zinc-500">No habits due today.</p>
        ) : (
          <ul className="space-y-2">
            {dueHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                logs={logs.filter((l) => l.habit_id === habit.id)}
                today={today}
                domains={domains}
                onToggle={toggleHabit}
                onAddLog={addHabitLog}
                onRemoveLog={removeHabitLog}
                onUpdate={handleUpdateHabit}
                onDelete={handleDeleteHabit}
              />
            ))}
          </ul>
        )}
      </details>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Today {todayTasks.length > 0 && `(${todayTasks.length})`}
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTaskTitle.trim() || addingTask) return;
            setAddingTask(true);
            const ok = await handleCreateTask(newTaskTitle);
            setAddingTask(false);
            if (ok) setNewTaskTitle("");
          }}
          className="mb-2 flex gap-2"
        >
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a task for today"
            disabled={addingTask}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={addingTask || !newTaskTitle.trim()}
            className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Add
          </button>
        </form>
        {todayTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing scheduled for today.</p>
        ) : (
          <ul className="space-y-2">
            {todayTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                domains={domains}
                projects={projects}
                onToggleDone={toggleTask}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
              />
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
              <TaskRow
                key={task.id}
                task={task}
                domains={domains}
                projects={projects}
                onToggleDone={toggleTask}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
              />
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
