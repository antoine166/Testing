"use client";

import { useState, type FormEvent } from "react";
import { todayLocal } from "@/lib/date";
import { usePageData } from "@/lib/hooks/use-page-data";
import WorkoutRow, { type Workout, type WorkoutLog } from "@/components/workout-row";
import { useConfirmDialog } from "@/components/confirm-dialog";

const HISTORY_WINDOW_OPTIONS = [7, 14, 28, 74, 148] as const;

function shiftDate(date: string, deltaDays: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + deltaDays);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function TrainingLogPage() {
  const { confirm } = useConfirmDialog();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [creating, setCreating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [newName, setNewName] = useState("");
  const [newWeeklyTarget, setNewWeeklyTarget] = useState("");
  const [historyWindow, setHistoryWindow] =
    useState<(typeof HISTORY_WINDOW_OPTIONS)[number]>(7);

  const { loading, error, setError, reload: loadAll } = usePageData(
    async (signal) => {
      const [workoutsRes, logsRes] = await Promise.all([
        fetch("/api/workouts", { signal }),
        fetch("/api/workout-logs", { signal }),
      ]);
      if (!workoutsRes.ok || !logsRes.ok) {
        throw new Error("Failed to load training log");
      }
      setWorkouts(await workoutsRes.json());
      setLogs(await logsRes.json());
    },
    { tables: ["workouts", "workout_logs"] },
  );

  async function handleCreateWorkout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);

    const res = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        weekly_target: newWeeklyTarget.trim() === "" ? null : Number(newWeeklyTarget),
      }),
    });

    setCreating(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create workout");
      return;
    }

    setNewName("");
    setNewWeeklyTarget("");
    await loadAll();
  }

  async function handleUpdateWorkout(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/workouts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update workout");
      return;
    }
    await loadAll();
  }

  async function handleDeleteWorkout(id: string) {
    if (
      !(await confirm({
        message:
          "Move this workout to trash? Its logged history moves with it and can be restored, within 30 days.",
        confirmLabel: "Move to Trash",
        danger: true,
      }))
    )
      return;

    const res = await fetch(`/api/workouts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete workout");
      return;
    }
    await loadAll();
  }

  async function createLog(workoutId: string, date: string) {
    const res = await fetch("/api/workout-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workout_id: workoutId, date }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to log workout");
      return;
    }
    await loadAll();
  }

  async function handleToggle(workout: Workout, date: string) {
    const logsForDate = logs
      .filter((l) => l.workout_id === workout.id && l.logged_date === date)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (logsForDate.length === 0) {
      await createLog(workout.id, date);
      return;
    }

    const res = await fetch(`/api/workout-logs/${logsForDate[0].id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to remove log");
      return;
    }
    await loadAll();
  }

  async function handleUpdateLog(
    id: string,
    updates: { duration_minutes?: number | null; notes?: string | null },
  ) {
    const res = await fetch(`/api/workout-logs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update log");
      return;
    }
    await loadAll();
  }

  async function handleDeleteLog(id: string) {
    const res = await fetch(`/api/workout-logs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to remove log");
      return;
    }
    await loadAll();
  }

  const historyCutoff = shiftDate(todayLocal(), -(historyWindow - 1));
  const loggedDates = Array.from(new Set(logs.map((l) => l.logged_date)))
    .filter((d) => d >= historyCutoff)
    .sort((a, b) => b.localeCompare(a));
  const workoutNameById = new Map(workouts.map((w) => [w.id, w.name]));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Training Log
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={handleCreateWorkout}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="new-workout" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            New workout
          </label>
          <input
            id="new-workout"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. GPP Lift"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label htmlFor="new-weekly-target" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Weekly goal
          </label>
          <input
            id="new-weekly-target"
            type="number"
            min={1}
            value={newWeeklyTarget}
            onChange={(e) => setNewWeeklyTarget(e.target.value)}
            placeholder="none"
            className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Log a day</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
                aria-label="Previous day"
                title="Previous day"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                ‹
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={todayLocal()}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
                disabled={selectedDate >= todayLocal()}
                aria-label="Next day"
                title="Next day"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900"
              >
                ›
              </button>
            </div>
          </div>

          {workouts.length === 0 ? (
            <p className="mb-8 text-sm text-zinc-500">No workouts yet. Add your first one above.</p>
          ) : (
            <ul className="mb-8 space-y-2">
              {workouts.map((workout) => (
                <WorkoutRow
                  key={workout.id}
                  workout={workout}
                  date={selectedDate}
                  today={todayLocal()}
                  logs={logs.filter((l) => l.workout_id === workout.id)}
                  onToggle={() => handleToggle(workout, selectedDate)}
                  onAddAnother={() => createLog(workout.id, selectedDate)}
                  onUpdateLog={handleUpdateLog}
                  onDeleteLog={handleDeleteLog}
                  onAttachmentsChanged={loadAll}
                  onUpdateWorkout={handleUpdateWorkout}
                  onDeleteWorkout={handleDeleteWorkout}
                />
              ))}
            </ul>
          )}

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              History (last {historyWindow} days)
            </h2>
            <select
              value={historyWindow}
              onChange={(e) =>
                setHistoryWindow(Number(e.target.value) as (typeof HISTORY_WINDOW_OPTIONS)[number])
              }
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              {HISTORY_WINDOW_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </div>
          {loggedDates.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing logged in this window.</p>
          ) : (
            <ul className="space-y-4">
              {loggedDates.map((date) => {
                const dayLogs = logs.filter((l) => l.logged_date === date);
                return (
                  <li key={date}>
                    <p className="mb-1.5 text-xs font-medium text-zinc-500">{date}</p>
                    <ul className="space-y-1.5">
                      {dayLogs.map((log) => (
                        <li
                          key={log.id}
                          className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                        >
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {workoutNameById.get(log.workout_id) ?? "(deleted workout)"}
                            {log.duration_minutes != null && (
                              <span className="ml-2 font-normal text-zinc-500">
                                {log.duration_minutes} min
                              </span>
                            )}
                          </p>
                          {log.notes && (
                            <p className="mt-0.5 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
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
                                      className="h-12 w-12 rounded-md object-cover"
                                    />
                                  </a>
                                ) : null,
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
