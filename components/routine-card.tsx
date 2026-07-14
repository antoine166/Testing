"use client";

import { useEffect, useState, type FormEvent } from "react";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "custom";

export type Routine = {
  id: string;
  name: string;
  time_of_day: TimeOfDay;
  active: boolean;
};

type RoutineItem = {
  id: string;
  title: string;
  duration_minutes: number | null;
  sort_order: number;
};

export const TIMES_OF_DAY: TimeOfDay[] = ["morning", "afternoon", "evening", "custom"];

function RoutineItemRow({
  item,
  isFirst,
  isLast,
  onMove,
  onUpdate,
  onDelete,
}: {
  item: RoutineItem;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onUpdate: (updates: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [duration, setDuration] = useState(item.duration_minutes?.toString() ?? "");

  function startEdit() {
    setTitle(item.title);
    setDuration(item.duration_minutes?.toString() ?? "");
    setEditing(true);
  }

  function handleSave() {
    if (!title.trim()) return;
    onUpdate({
      title,
      duration_minutes: duration ? Number(duration) : null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="min"
          className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          onClick={handleSave}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1 text-sm dark:bg-zinc-900">
      <span className="flex-1 text-zinc-900 dark:text-zinc-100">
        {item.title}
        {item.duration_minutes ? ` (${item.duration_minutes} min)` : ""}
      </span>
      <button
        onClick={() => onMove(-1)}
        disabled={isFirst}
        className="text-xs text-zinc-500 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        onClick={() => onMove(1)}
        disabled={isLast}
        className="text-xs text-zinc-500 disabled:opacity-30"
      >
        ↓
      </button>
      <button
        onClick={startEdit}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
      >
        Edit
      </button>
      <button
        onClick={onDelete}
        className="text-xs font-medium text-red-600 hover:text-red-700"
      >
        Delete
      </button>
    </li>
  );
}

export default function RoutineCard({
  routine,
  onUpdate,
  onDelete,
}: {
  routine: Routine;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(routine.name);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(routine.time_of_day);

  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDuration, setNewItemDuration] = useState("");

  async function loadItems() {
    const res = await fetch(`/api/routines/${routine.id}/items`);
    if (res.ok) setItems(await res.json());
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/routines/${routine.id}/items`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: RoutineItem[]) => setItems(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoadingItems(false));
    return () => controller.abort();
  }, [routine.id]);

  function startEdit() {
    setName(routine.name);
    setTimeOfDay(routine.time_of_day);
    setEditing(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    onUpdate(routine.id, { name, time_of_day: timeOfDay });
    setEditing(false);
  }

  async function handleAddItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const res = await fetch(`/api/routines/${routine.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newItemTitle,
        duration_minutes: newItemDuration ? Number(newItemDuration) : undefined,
      }),
    });

    if (res.ok) {
      setNewItemTitle("");
      setNewItemDuration("");
      await loadItems();
    }
  }

  async function handleUpdateItem(id: string, updates: Record<string, unknown>) {
    await fetch(`/api/routine-items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await loadItems();
  }

  async function handleDeleteItem(id: string) {
    await fetch(`/api/routine-items/${id}`, { method: "DELETE" });
    await loadItems();
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const a = items[index];
    const b = items[targetIndex];

    await Promise.all([
      fetch(`/api/routine-items/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: b.sort_order }),
      }),
      fetch(`/api/routine-items/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: a.sort_order }),
      }),
    ]);

    await loadItems();
  }

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      {editing ? (
        <div className="mb-3 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <select
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as TimeOfDay)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {TIMES_OF_DAY.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={handleSave}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {routine.name}
            </p>
            <p className="text-xs text-zinc-500">{routine.time_of_day}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={startEdit}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(routine.id)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {loadingItems ? (
        <p className="text-xs text-zinc-500">Loading steps...</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <RoutineItemRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onMove={(direction) => moveItem(index, direction)}
              onUpdate={(updates) => handleUpdateItem(item.id, updates)}
              onDelete={() => handleDeleteItem(item.id)}
            />
          ))}
        </ul>
      )}

      <form onSubmit={handleAddItem} className="mt-2 flex gap-2">
        <input
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          placeholder="Add a step"
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          value={newItemDuration}
          onChange={(e) => setNewItemDuration(e.target.value)}
          placeholder="min"
          className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-950 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </form>
    </li>
  );
}
