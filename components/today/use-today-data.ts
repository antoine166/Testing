"use client";

import { useEffect, useState } from "react";
import { postHabitLog, deleteHabitLog } from "@/lib/habits/api";
import { type Habit, type HabitLogRow } from "@/components/habit-row";
import { type Routine } from "@/components/routine-card";
import { markLocalRefresh, useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { markRemovalKind } from "@/components/leave-transition";
import { ticklerConversionToast, useToast } from "@/components/toast";
import { useConfirmDialog } from "@/components/confirm-dialog";

type Checkin = {
  date: string;
  energy_level: number;
  focus_level: number;
  notes: string | null;
} | null;

export type RoutineItem = {
  id: string;
  routine_id: string;
  title: string;
  duration_minutes: number | null;
  sort_order: number;
};

export type TicklerItem = { id: string; note: string; revisit_date: string };

export function currentTimeOfDay(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

async function fetchDashboardData(today: string, opts?: RequestInit) {
  const [checkinRes, habitsRes, logsRes, routinesRes, ticklerRes, reviewLogsRes] =
    await Promise.all([
      fetch(`/api/checkins?date=${today}`, opts),
      fetch("/api/habits", opts),
      fetch("/api/habit-logs", opts),
      fetch("/api/routines", opts),
      fetch("/api/tickler-items", opts),
      fetch("/api/weekly-review-logs", opts),
    ]);

  if (!checkinRes.ok || !habitsRes.ok || !logsRes.ok || !routinesRes.ok || !ticklerRes.ok) {
    throw new Error("Failed to load today's data");
  }

  const [checkin, habits, logs, routines, ticklerItems, reviewLogs] = await Promise.all([
    checkinRes.json(),
    habitsRes.json(),
    logsRes.json(),
    routinesRes.json(),
    ticklerRes.json(),
    // Non-fatal — the review nudge just stays hidden if this fails.
    reviewLogsRes.ok ? reviewLogsRes.json() : [],
  ]);

  return { checkin, habits, logs, routines, ticklerItems, reviewLogs };
}

export function useTodayData(today: string, refreshTasks: () => Promise<void>) {
  const [checkin, setCheckin] = useState<Checkin>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineItems, setRoutineItems] = useState<Record<string, RoutineItem[]>>({});
  const [ticklerItems, setTicklerItems] = useState<TicklerItem[]>([]);
  const [reviewLogs, setReviewLogs] = useState<{ completed_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirmDialog();

  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const [savingCheckin, setSavingCheckin] = useState(false);

  async function loadExtras() {
    markLocalRefresh();
    try {
      const data = await fetchDashboardData(today);
      setCheckin(data.checkin);
      setHabits(data.habits);
      setLogs(data.logs);
      setRoutines(data.routines);
      setTicklerItems(data.ticklerItems);
      setReviewLogs(data.reviewLogs);
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
        setRoutines(data.routines);
        setTicklerItems(data.ticklerItems);
        setReviewLogs(data.reviewLogs);
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
      "routines",
      "routine_items",
      "tickler_items",
      "weekly_review_logs",
    ],
    () => loadExtras(),
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

    await loadExtras();
  }

  async function addHabitLog(habit: Habit, date: string) {
    // If this log clears the habit for today it leaves the due list —
    // plain collapse (the punch in HabitRow already celebrated). Expires
    // unused when the habit stays (times_per_week under target).
    markRemovalKind(habit.id, "done");
    const result = await postHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadExtras();
  }

  async function removeHabitLog(habit: Habit, date: string) {
    const result = await deleteHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadExtras();
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

    await loadExtras();
  }

  async function handleDeleteHabit(id: string) {
    if (
      !(await confirm({
        message: "Move this habit to trash? You can restore it, with its log history, within 30 days.",
        confirmLabel: "Move to Trash",
        danger: true,
      }))
    )
      return;

    const res = await fetch(`/api/habits/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete habit");
      return;
    }

    await loadExtras();
  }

  async function handleTicklerConvert(id: string) {
    const res = await fetch(`/api/tickler-items/${id}/convert-to-task`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to convert to task");
      return;
    }
    // The new task lands in the Inbox, not on Today — say so.
    showToast(...ticklerConversionToast(await res.json().catch(() => null)));
    await Promise.all([loadExtras(), refreshTasks()]);
  }

  async function handleTicklerSnooze(id: string) {
    // Push the revisit date a week out from today (not from the original
    // date — an item three weeks overdue shouldn't need three snoozes).
    const [y, m, d] = today.split("-").map(Number);
    const next = new Date(y, m - 1, d + 7);
    const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const res = await fetch(`/api/tickler-items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisit_date: nextDate }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to snooze tickler item");
      return;
    }
    await loadExtras();
  }

  return {
    checkin,
    habits,
    logs,
    routines,
    routineItems,
    ticklerItems,
    reviewLogs,
    loading,
    error,
    setError,
    energyLevel,
    setEnergyLevel,
    focusLevel,
    setFocusLevel,
    savingCheckin,
    handleSaveCheckin,
    addHabitLog,
    removeHabitLog,
    toggleHabit,
    handleUpdateHabit,
    handleDeleteHabit,
    handleTicklerConvert,
    handleTicklerSnooze,
  };
}
