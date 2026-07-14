"use client";

import { useEffect, useState, type FormEvent } from "react";

export type Checklist = {
  id: string;
  name: string;
};

type ChecklistItem = {
  id: string;
  title: string;
  checked: boolean;
  sort_order: number;
};

function ChecklistItemRow({
  item,
  isFirst,
  isLast,
  onMove,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: ChecklistItem;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggle: () => void;
  onUpdate: (updates: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);

  function startEdit() {
    setTitle(item.title);
    setEditing(true);
  }

  function handleSave() {
    if (!title.trim()) return;
    onUpdate({ title });
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
      <input type="checkbox" checked={item.checked} onChange={onToggle} />
      <span
        className={`flex-1 ${
          item.checked
            ? "text-zinc-400 line-through dark:text-zinc-600"
            : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {item.title}
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

export default function ChecklistCard({
  checklist,
  onUpdate,
  onDelete,
}: {
  checklist: Checklist;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(checklist.name);

  const [newItemTitle, setNewItemTitle] = useState("");

  async function loadItems() {
    const res = await fetch(`/api/checklists/${checklist.id}/items`);
    if (res.ok) setItems(await res.json());
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/checklists/${checklist.id}/items`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: ChecklistItem[]) => setItems(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoadingItems(false));
    return () => controller.abort();
  }, [checklist.id]);

  function startEdit() {
    setName(checklist.name);
    setEditing(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    onUpdate(checklist.id, { name });
    setEditing(false);
  }

  async function handleAddItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    const res = await fetch(`/api/checklists/${checklist.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newItemTitle }),
    });

    if (res.ok) {
      setNewItemTitle("");
      await loadItems();
    }
  }

  async function handleToggleItem(item: ChecklistItem) {
    await fetch(`/api/checklist-items/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: !item.checked }),
    });
    await loadItems();
  }

  async function handleUpdateItem(id: string, updates: Record<string, unknown>) {
    await fetch(`/api/checklist-items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await loadItems();
  }

  async function handleDeleteItem(id: string) {
    await fetch(`/api/checklist-items/${id}`, { method: "DELETE" });
    await loadItems();
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const a = items[index];
    const b = items[targetIndex];

    await Promise.all([
      fetch(`/api/checklist-items/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: b.sort_order }),
      }),
      fetch(`/api/checklist-items/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: a.sort_order }),
      }),
    ]);

    await loadItems();
  }

  async function handleReset() {
    if (!confirm("Uncheck everything on this checklist?")) return;
    await fetch(`/api/checklists/${checklist.id}/reset`, { method: "POST" });
    await loadItems();
  }

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      {editing ? (
        <div className="mb-3 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
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
              {checklist.name}
            </p>
            {items.length > 0 && (
              <p className="text-xs text-zinc-500">
                {checkedCount}/{items.length} checked
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              Reset
            </button>
            <button
              onClick={startEdit}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(checklist.id)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {loadingItems ? (
        <p className="text-xs text-zinc-500">Loading items...</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onMove={(direction) => moveItem(index, direction)}
              onToggle={() => handleToggleItem(item)}
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
          placeholder="Add an item"
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
