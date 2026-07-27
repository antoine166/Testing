"use client";

import { useEffect, useState, type FormEvent } from "react";
import ChecklistCard, { type Checklist } from "@/components/checklist-card";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");

  async function loadChecklists() {
    try {
      const res = await fetch("/api/checklists");
      if (!res.ok) throw new Error("Failed to load checklists");
      setChecklists(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/checklists", { signal: controller.signal })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("Failed to load checklists")),
      )
      .then((data: Checklist[]) => setChecklists(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  useRealtimeRefresh(["checklists", "checklist_items"], () => loadChecklists());

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);

    const res = await fetch("/api/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    setCreating(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create checklist");
      return;
    }

    setName("");
    await loadChecklists();
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/checklists/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update checklist");
      return;
    }

    await loadChecklists();
  }

  async function handleDelete(id: string) {
    if (!confirm("Move this checklist to trash? You can restore it, with its items, within 30 days.")) return;

    const res = await fetch(`/api/checklists/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete checklist");
      return;
    }

    await loadChecklists();
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Checklists
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
            New checklist
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Packing list"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
      ) : checklists.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No checklists yet. Add your first one above.
        </p>
      ) : (
        <ul className="space-y-4">
          {checklists.map((checklist) => (
            <ChecklistCard
              key={checklist.id}
              checklist={checklist}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
