"use client";

import { useState, type FormEvent } from "react";
import { todayLocal } from "@/lib/date";
import { postHabitLog, deleteHabitLog } from "@/lib/habits/api";
import { isAtRisk, isPendingToday } from "@/lib/habits/streaks";
import { usePageData } from "@/lib/hooks/use-page-data";
import {
  FrequencyFields,
  FREQUENCIES,
  type Habit,
  type HabitDomain,
  type HabitLogRow,
  type HabitFrequency,
} from "@/components/habit-row";
import ReorderableHabitList from "@/components/reorderable-habit-list";
import { useConfirmDialog } from "@/components/confirm-dialog";

export default function HabitsPage() {
  const { confirm } = useConfirmDialog();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [domains, setDomains] = useState<HabitDomain[]>([]);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");
  const [frequencyDays, setFrequencyDays] = useState<number[]>([]);
  const [targetCount, setTargetCount] = useState(3);
  const [domainId, setDomainId] = useState("");

  const today = todayLocal();

  const { loading, error, setError, reload: loadAll } = usePageData(
    async (signal) => {
      const [habitsRes, logsRes, domainsRes] = await Promise.all([
        fetch("/api/habits", { signal }),
        fetch("/api/habit-logs", { signal }),
        fetch("/api/domains", { signal }),
      ]);
      if (!habitsRes.ok || !logsRes.ok || !domainsRes.ok) {
        throw new Error("Failed to load habits");
      }
      setHabits(await habitsRes.json());
      setLogs(await logsRes.json());
      setDomains(await domainsRes.json());
    },
    { tables: ["habits", "habit_logs", "domains"] },
  );

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);

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

    setCreating(false);
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

  // Sections, in render order. The API already serves habits in the global
  // manual order (sort_order nulls-first, then name — #142); each section
  // preserves that, with the pending one layering its at-risk safety sort
  // on top (stable, so the manual order survives within each group).
  const pendingHabits = habits
    .filter((h) => h.active && isPendingToday(h, logs.filter((l) => l.habit_id === h.id), today))
    .sort((a, b) => {
      const aRisk = isAtRisk(a, logs.filter((l) => l.habit_id === a.id), today);
      const bRisk = isAtRisk(b, logs.filter((l) => l.habit_id === b.id), today);
      return aRisk === bRisk ? 0 : aRisk ? -1 : 1;
    });
  const pendingIds = new Set(pendingHabits.map((h) => h.id));
  const unfiledHabits = habits.filter((h) => !h.domain_id && !pendingIds.has(h.id));
  const domainSections = domains
    .map((domain) => ({
      domain,
      habits: habits.filter((h) => h.domain_id === domain.id && !pendingIds.has(h.id)),
    }))
    .filter((s) => s.habits.length > 0);

  // Habits keep ONE global order (the approved cut): a drag inside any one
  // section commits the whole page's current display order — with that
  // section's new arrangement spliced in — so every list agrees afterwards.
  async function handleReorder(sectionKey: string, orderedIds: string[]) {
    const sections: { key: string; ids: string[] }[] = [
      { key: "pending", ids: pendingHabits.map((h) => h.id) },
      { key: "unfiled", ids: unfiledHabits.map((h) => h.id) },
      ...domainSections.map((s) => ({ key: s.domain.id, ids: s.habits.map((h) => h.id) })),
    ];
    const ids = sections.flatMap((s) => (s.key === sectionKey ? orderedIds : s.ids));

    const res = await fetch("/api/habits/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save the new order — try again.");
      return;
    }
    await loadAll();
  }

  // Shared row wiring for every section's ReorderableHabitList.
  const listProps = {
    logs,
    today,
    domains,
    onToggle: toggleDate,
    onAddLog: addLog,
    onRemoveLog: removeLog,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
  };

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
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1">
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
          disabled={creating}
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 disabled:opacity-50"
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
          {pendingHabits.length > 0 && (
            <details open className="group">
              <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                <span className="text-zinc-400 transition-transform group-open:rotate-90">
                  ›
                </span>
                Still To Do ({pendingHabits.length})
              </summary>
              <ul className="space-y-2">
                <ReorderableHabitList
                  habits={pendingHabits}
                  onCommitOrder={(ids) => handleReorder("pending", ids)}
                  {...listProps}
                />
              </ul>
            </details>
          )}

          {unfiledHabits.length > 0 && (
            <details open className="group">
              <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                <span className="text-zinc-400 transition-transform group-open:rotate-90">
                  ›
                </span>
                No domain
              </summary>
              <ul className="space-y-2">
                <ReorderableHabitList
                  habits={unfiledHabits}
                  onCommitOrder={(ids) => handleReorder("unfiled", ids)}
                  {...listProps}
                />
              </ul>
            </details>
          )}

          {domainSections.map(({ domain, habits: domainHabits }) => (
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
                <ReorderableHabitList
                  habits={domainHabits}
                  onCommitOrder={(ids) => handleReorder(domain.id, ids)}
                  {...listProps}
                />
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
