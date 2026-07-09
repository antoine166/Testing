"use client";

import { useEffect, useState } from "react";

type TrashItem = {
  id: string;
  type: string;
  name: string;
  deleted_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  domain: "Domain",
  project: "Project",
  task: "Task",
  habit: "Habit",
  routine: "Routine",
  checklist: "Checklist",
  "knowledge-item": "Library item",
};

const RETENTION_DAYS = 30;

function daysRemaining(deletedAt: string): number {
  const purgeAt = new Date(deletedAt).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/trash", { signal: controller.signal })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("Failed to load trash")),
      )
      .then((data: TrashItem[]) => setItems(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  async function handleRestore(item: TrashItem) {
    const res = await fetch(`/api/trash/${item.type}/${item.id}`, { method: "PATCH" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to restore item");
      return;
    }

    setItems((prev) => prev.filter((i) => !(i.type === item.type && i.id === item.id)));
  }

  async function handlePurge(item: TrashItem) {
    if (!confirm(`Permanently delete "${item.name}"? This can't be undone.`)) return;

    const res = await fetch(`/api/trash/${item.type}/${item.id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete item");
      return;
    }

    setItems((prev) => prev.filter((i) => !(i.type === item.type && i.id === item.id)));
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Trash
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Deleted items stay here for 30 days, then are removed for good.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">Trash is empty.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const remaining = daysRemaining(item.deleted_at);
            return (
              <li
                key={`${item.type}-${item.id}`}
                className="flex items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {item.name}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {remaining} day{remaining === 1 ? "" : "s"} left
                  </p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    onClick={() => handleRestore(item)}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handlePurge(item)}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Delete forever
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
