"use client";

import { useState, type FormEvent } from "react";
import RoutineCard, {
  TIMES_OF_DAY,
  type Routine,
  type TimeOfDay,
} from "@/components/routine-card";
import { usePageData } from "@/lib/hooks/use-page-data";
import { useConfirmDialog } from "@/components/confirm-dialog";

const TIME_ORDER: Record<TimeOfDay, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  custom: 3,
};

export default function RoutinesPage() {
  const { confirm } = useConfirmDialog();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("morning");

  const { loading, error, setError, reload: loadRoutines } = usePageData(
    async (signal) => {
      const res = await fetch("/api/routines", { signal });
      if (!res.ok) throw new Error("Failed to load routines");
      setRoutines(await res.json());
    },
    { tables: ["routines", "routine_items"] },
  );

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);

    const res = await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, time_of_day: timeOfDay }),
    });

    setCreating(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create routine");
      return;
    }

    setName("");
    setTimeOfDay("morning");
    await loadRoutines();
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/routines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update routine");
      return;
    }

    await loadRoutines();
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm({
        message: "Move this routine to trash? You can restore it, with its steps, within 30 days.",
        confirmLabel: "Move to Trash",
        danger: true,
      }))
    )
      return;

    const res = await fetch(`/api/routines/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete routine");
      return;
    }

    await loadRoutines();
  }

  const sortedRoutines = [...routines].sort(
    (a, b) => TIME_ORDER[a.time_of_day] - TIME_ORDER[b.time_of_day],
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Routines
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-8 flex items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex-1">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            New routine
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning routine"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="time_of_day"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Time of day
          </label>
          <select
            id="time_of_day"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {TIMES_OF_DAY.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
      ) : sortedRoutines.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No routines yet. Add your first one above.
        </p>
      ) : (
        <ul className="space-y-4">
          {sortedRoutines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
