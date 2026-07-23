"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { todayLocal } from "@/lib/date";
import { isPendingToday } from "@/lib/habits/streaks";
import { postHabitLog } from "@/lib/habits/api";
import type { Habit, HabitLogRow } from "@/components/habit-row";

// The evening bookend to the morning check-in: a 60-second Daily Shutdown.
// Its one job is making sure nothing drifts — every unfinished task from
// today gets an explicit decision (tomorrow / anytime / someday / done)
// instead of silently rotting into Overdue, which is exactly how a system
// loses trust. Then log any habits actually done, sweep the head, done.

type Task = {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  someday: boolean;
  waiting_for: boolean;
};

type Step = "triage" | "habits" | "capture" | "done";

export default function ShutdownPage() {
  const today = todayLocal();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("triage");
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [captureTitle, setCaptureTitle] = useState("");
  const [captured, setCaptured] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/tasks", { signal: controller.signal }),
      fetch("/api/habits", { signal: controller.signal }),
      fetch("/api/habit-logs", { signal: controller.signal }),
    ])
      .then(async ([tasksRes, habitsRes, logsRes]) => {
        if (!tasksRes.ok || !habitsRes.ok || !logsRes.ok)
          throw new Error("Failed to load today's data");
        return Promise.all([tasksRes.json(), habitsRes.json(), logsRes.json()]);
      })
      .then(([tasksData, habitsData, logsData]: [Task[], Habit[], HabitLogRow[]]) => {
        setTasks(tasksData);
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

  // Today's leftovers plus anything already overdue — the whole drift pile,
  // triaged in one place. (Waiting For is excluded: those aren't yours to
  // finish tonight.)
  const leftovers = tasks.filter(
    (t) =>
      t.status !== "done" &&
      !t.someday &&
      !t.waiting_for &&
      t.scheduled_date &&
      t.scheduled_date <= today &&
      !decided.has(t.id),
  );

  const pendingHabits = habits.filter(
    (h) =>
      h.active &&
      isPendingToday(
        h,
        logs.filter((l) => l.habit_id === h.id),
        today,
      ),
  );

  const tomorrow = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  })();

  async function updateTask(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update task");
      return false;
    }
    setDecided((prev) => new Set(prev).add(id));
    return true;
  }

  async function markDone(id: string) {
    await updateTask(id, { status: "done" });
  }

  async function logHabit(habitId: string) {
    const result = await postHabitLog(habitId, today);
    if (!result.ok) {
      setError(result.error ?? "Failed to log habit");
      return;
    }
    setLogs((prev) => [...prev, { habit_id: habitId, logged_date: today } as HabitLogRow]);
  }

  async function handleCapture(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = captureTitle.trim();
    if (!title) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to capture");
      return;
    }
    setCaptured((prev) => [...prev, title]);
    setCaptureTitle("");
  }

  const decisionButton =
    "rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800";

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-1 text-2xl font-semibold">🌙 Daily Shutdown</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Sixty seconds to close the day on purpose: decide the leftovers, log what you did,
        empty your head. Nothing drifts.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {step === "triage" && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-lg font-medium">Decide the leftovers</p>
          <p className="mt-1 text-sm text-zinc-500">
            {leftovers.length === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ Nothing left undecided from today.
              </span>
            ) : (
              <>
                {leftovers.length} task{leftovers.length === 1 ? "" : "s"} still on today&apos;s
                plate. An explicit decision for each — no silent carryover.
              </>
            )}
          </p>
          {leftovers.length > 0 && (
            <ul className="mt-3 space-y-2">
              {leftovers.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <span className="text-sm">{t.title}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => markDone(t.id)} className={decisionButton}>
                      ✓ Did it
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTask(t.id, { scheduled_date: tomorrow, scheduled_time: null })}
                      className={decisionButton}
                    >
                      → Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTask(t.id, { scheduled_date: null, scheduled_time: null })}
                      className={decisionButton}
                    >
                      → Anytime
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateTask(t.id, { someday: true, scheduled_date: null, scheduled_time: null })
                      }
                      className={decisionButton}
                    >
                      📦 Someday
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setStep("habits")}
              disabled={leftovers.length > 0}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              title={
                leftovers.length > 0 ? "Decide every leftover first — that's the whole point" : undefined
              }
            >
              {leftovers.length > 0 ? `${leftovers.length} still to decide` : "Next — habits"}
            </button>
            {leftovers.length > 0 && (
              <button
                onClick={() => setStep("habits")}
                className="text-xs text-zinc-500 underline"
              >
                Skip tonight — leave them overdue
              </button>
            )}
          </div>
        </div>
      )}

      {step === "habits" && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-lg font-medium">Log what you did</p>
          <p className="mt-1 text-sm text-zinc-500">
            {pendingHabits.length === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ Every habit due today is logged.
              </span>
            ) : (
              <>Anything here you actually did today and just didn&apos;t log?</>
            )}
          </p>
          {pendingHabits.length > 0 && (
            <ul className="mt-3 space-y-2">
              {pendingHabits.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <span className="text-sm">
                    {h.icon ? `${h.icon} ` : ""}
                    {h.name}
                  </span>
                  <button type="button" onClick={() => logHabit(h.id)} className={decisionButton}>
                    ✓ Did it
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setStep("capture")}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Next — empty your head
            </button>
            <button onClick={() => setStep("triage")} className="text-sm text-zinc-500 underline">
              Back
            </button>
          </div>
        </div>
      )}

      {step === "capture" && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-lg font-medium">Empty your head</p>
          <p className="mt-1 text-sm text-zinc-500">
            Anything still rattling around from today — a loose end, something someone said,
            tomorrow&apos;s first worry? Type it, Enter, it&apos;s in the Inbox. Not tonight&apos;s
            problem anymore.
          </p>
          <form onSubmit={handleCapture} className="mt-3 flex gap-2">
            <input
              value={captureTitle}
              onChange={(e) => setCaptureTitle(e.target.value)}
              placeholder="It's out of your head once it's in the box"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            >
              Capture
            </button>
          </form>
          {captured.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {captured.map((title, i) => (
                <li key={i} className="text-xs text-zinc-500">
                  ✓ {title}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setStep("done")}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Done — shut it down
            </button>
            <button onClick={() => setStep("habits")} className="text-sm text-zinc-500 underline">
              Back
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-xl border border-zinc-200 p-8 text-center dark:border-zinc-800">
          <p className="text-3xl">🌙</p>
          <p className="mt-2 text-lg font-semibold">Day closed</p>
          <p className="mt-1 text-sm text-zinc-500">
            Everything&apos;s decided, logged, or captured. Your head is allowed to go home now.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Back to Today
          </Link>
        </div>
      )}
    </div>
  );
}
