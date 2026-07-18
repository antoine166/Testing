"use client";

import { useEffect, useState, type FormEvent } from "react";
import SmartListHeader from "@/components/smart-list-header";
import TaskRow from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { todayLocal } from "@/lib/date";

type TicklerItem = { id: string; note: string; revisit_date: string };

export default function SomedayPage() {
  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    handleUpdate,
    toggleDone,
    handleDelete,
    handleConvertToProject,
  } = useTaskList();

  const [ticklerItems, setTicklerItems] = useState<TicklerItem[]>([]);
  const [ticklerLoading, setTicklerLoading] = useState(true);
  const [ticklerError, setTicklerError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [revisitDate, setRevisitDate] = useState("");

  async function loadTicklerItems(signal?: AbortSignal) {
    try {
      const res = await fetch("/api/tickler-items", { signal });
      if (!res.ok) throw new Error("Failed to load tickler items");
      setTicklerItems(await res.json());
      setTicklerError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setTicklerError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setTicklerLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/tickler-items", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load tickler items"))))
      .then((data: TicklerItem[]) => setTicklerItems(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTicklerError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setTicklerLoading(false));

    return () => controller.abort();
  }, []);

  useRealtimeRefresh(["tickler_items"], () => loadTicklerItems());

  async function handleCapture(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!note.trim() || !revisitDate) return;

    const res = await fetch("/api/tickler-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, revisit_date: revisitDate }),
    });

    if (!res.ok) {
      const body = await res.json();
      setTicklerError(body.error ?? "Failed to add tickler item");
      return;
    }

    setNote("");
    setRevisitDate("");
    await loadTicklerItems();
  }

  async function handleTicklerDelete(id: string) {
    if (!confirm("Move this tickler item to trash? You can restore it within 30 days.")) return;
    const res = await fetch(`/api/tickler-items/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setTicklerError(body.error ?? "Failed to delete tickler item");
      return;
    }
    await loadTicklerItems();
  }

  async function handleConvertToTask(id: string) {
    const res = await fetch(`/api/tickler-items/${id}/convert-to-task`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      setTicklerError(body.error ?? "Failed to convert to task");
      return;
    }
    await loadTicklerItems();
  }

  const today = todayLocal();
  const somedayTasks = tasks.filter((t) => t.someday && t.status !== "done");
  // GTD's tickler file: a date-specific trigger that's arrived means this
  // is due for reconsideration, not just sitting in the pile indefinitely.
  const readyToRevisit = somedayTasks.filter((t) => t.revisit_date && t.revisit_date <= today);
  const rest = somedayTasks.filter((t) => !(t.revisit_date && t.revisit_date <= today));

  const ticklerReady = ticklerItems.filter((t) => t.revisit_date <= today);
  const ticklerUpcoming = ticklerItems.filter((t) => t.revisit_date > today);

  const rowProps = {
    domains,
    projects,
    onToggleDone: toggleDone,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
    onConvertToProject: handleConvertToProject,
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📦" color="#d97706" title="Someday" count={somedayTasks.length} />

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : somedayTasks.length === 0 ? (
        <p className="mb-6 text-sm text-zinc-500">
          Nothing deferred — mark a task &ldquo;Someday&rdquo; from its edit form to stash it here.
        </p>
      ) : (
        <div className="mb-8">
          {readyToRevisit.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-500">
                🔔 Ready to revisit ({readyToRevisit.length})
              </h2>
              <ul className="space-y-2">
                {readyToRevisit.map((task) => (
                  <TaskRow key={task.id} task={task} {...rowProps} />
                ))}
              </ul>
            </div>
          )}
          {rest.length > 0 && (
            <ul className="space-y-2">
              {rest.map((task) => (
                <TaskRow key={task.id} task={task} {...rowProps} />
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          🗂️ Tickler
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          A note that isn&rsquo;t a task yet — &ldquo;don&rsquo;t think about this until March.&rdquo;
          Nothing to act on until its date arrives.
        </p>

        {ticklerError && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {ticklerError}
          </p>
        )}

        <form
          onSubmit={handleCapture}
          className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Reconsider the gym membership"
            required
            className="min-w-48 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="date"
            value={revisitDate}
            onChange={(e) => setRevisitDate(e.target.value)}
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Add
          </button>
        </form>

        {ticklerLoading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : ticklerItems.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing in the tickler file.</p>
        ) : (
          <>
            {ticklerReady.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-500">
                  🔔 Ready to revisit ({ticklerReady.length})
                </h3>
                <ul className="space-y-2">
                  {ticklerReady.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950"
                    >
                      <p className="text-sm text-zinc-900 dark:text-zinc-100">{item.note}</p>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleConvertToTask(item.id)}
                          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        >
                          Convert to task
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTicklerDelete(item.id)}
                          className="text-sm font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ticklerUpcoming.length > 0 && (
              <ul className="space-y-2">
                {ticklerUpcoming.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                  >
                    <div>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100">{item.note}</p>
                      <p className="text-xs text-zinc-500">Revisit {item.revisit_date}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTicklerDelete(item.id)}
                      className="shrink-0 text-sm font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
