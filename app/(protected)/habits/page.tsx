"use client";

import { useEffect, useState, type FormEvent } from "react";
import { todayLocal } from "@/lib/date";
import { postHabitLog, deleteHabitLog } from "@/lib/habits/api";
import HabitRow, {
  FrequencyFields,
  FREQUENCIES,
  type Habit,
  type HabitDomain,
  type HabitLogRow,
  type HabitFrequency,
} from "@/components/habit-row";

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [domains, setDomains] = useState<HabitDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");
  const [frequencyDays, setFrequencyDays] = useState<number[]>([]);
  const [targetCount, setTargetCount] = useState(3);
  const [domainId, setDomainId] = useState("");

  const today = todayLocal();

  async function loadAll() {
    try {
      const [habitsRes, logsRes, domainsRes] = await Promise.all([
        fetch("/api/habits"),
        fetch("/api/habit-logs"),
        fetch("/api/domains"),
      ]);
      if (!habitsRes.ok || !logsRes.ok || !domainsRes.ok) {
        throw new Error("Failed to load habits");
      }
      setHabits(await habitsRes.json());
      setLogs(await logsRes.json());
      setDomains(await domainsRes.json());
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
      fetch("/api/habits", opts),
      fetch("/api/habit-logs", opts),
      fetch("/api/domains", opts),
    ])
      .then(async ([habitsRes, logsRes, domainsRes]) => {
        if (!habitsRes.ok || !logsRes.ok || !domainsRes.ok) {
          throw new Error("Failed to load habits");
        }
        return Promise.all([habitsRes.json(), logsRes.json(), domainsRes.json()]);
      })
      .then(([habitsData, logsData, domainsData]) => {
        setHabits(habitsData);
        setLogs(logsData);
        setDomains(domainsData);
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
        frequency,
        frequency_days: frequency === "specific_days" ? frequencyDays : null,
        target_count: frequency === "times_per_week" ? targetCount : null,
        domain_id: domainId || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create habit");
      return;
    }

    setName("");
    setFrequency("daily");
    setFrequencyDays([]);
    setTargetCount(3);
    setDomainId("");
    await loadAll();
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
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

  async function handleDelete(id: string) {
    if (!confirm("Move this habit to trash? You can restore it, with its log history, within 30 days.")) return;

    const res = await fetch(`/api/habits/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete habit");
      return;
    }

    await loadAll();
  }

  async function addLog(habit: Habit, date: string) {
    const result = await postHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadAll();
  }

  async function removeLog(habit: Habit, date: string) {
    const result = await deleteHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadAll();
  }

  async function toggleDate(habit: Habit, date: string, loggedOnDate: boolean) {
    if (loggedOnDate) {
      await removeLog(habit, date);
    } else {
      await addLog(habit, date);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Habits
      </h1>

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
          <div>
            <label
              htmlFor="domain"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Domain
            </label>
            <select
              id="domain"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No domain</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
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
        <div className="space-y-6">
          {(() => {
            const unfiled = habits.filter((h) => !h.domain_id);
            if (unfiled.length === 0) return null;
            return (
              <details open className="group">
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">
                    ›
                  </span>
                  No domain
                </summary>
                <ul className="space-y-2">
                  {unfiled.map((habit) => (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      logs={logs.filter((l) => l.habit_id === habit.id)}
                      today={today}
                      domains={domains}
                      onToggle={toggleDate}
                      onAddLog={addLog}
                      onRemoveLog={removeLog}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </details>
            );
          })()}

          {domains.map((domain) => {
            const domainHabits = habits.filter((h) => h.domain_id === domain.id);
            if (domainHabits.length === 0) return null;
            return (
              <details key={domain.id} open className="group">
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">
                    ›
                  </span>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: domain.color }}
                  />
                  {domain.name}
                </summary>
                <ul className="space-y-2">
                  {domainHabits.map((habit) => (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      logs={logs.filter((l) => l.habit_id === habit.id)}
                      today={today}
                      domains={domains}
                      onToggle={toggleDate}
                      onAddLog={addLog}
                      onRemoveLog={removeLog}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
