"use client";

import { useState, type FormEvent } from "react";
import SmartListHeader from "@/components/smart-list-header";
import { usePageData } from "@/lib/hooks/use-page-data";

type AgendaItem = {
  id: string;
  person_name: string;
  note: string;
  done: boolean;
  created_at: string;
};

export default function AgendasPage() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [creating, setCreating] = useState(false);

  const [personName, setPersonName] = useState("");
  const [note, setNote] = useState("");

  const { loading, error, setError, reload: loadAll } = usePageData(
    async (signal) => {
      const res = await fetch("/api/agenda-items", { signal });
      if (!res.ok) throw new Error("Failed to load agendas");
      setItems(await res.json());
    },
    { tables: ["agenda_items"] },
  );

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!personName.trim() || !note.trim() || creating) return;
    setCreating(true);

    const res = await fetch("/api/agenda-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_name: personName, note }),
    });

    setCreating(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to add agenda item");
      return;
    }

    setNote("");
    await loadAll();
  }

  async function toggleDone(item: AgendaItem) {
    await fetch(`/api/agenda-items/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !item.done }),
    });
    await loadAll();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/agenda-items/${id}`, { method: "DELETE" });
    await loadAll();
  }

  const grouped = new Map<string, AgendaItem[]>();
  for (const item of items) {
    if (!grouped.has(item.person_name)) grouped.set(item.person_name, []);
    grouped.get(item.person_name)!.push(item);
  }
  const people = Array.from(grouped.keys()).sort();
  const openCount = items.filter((i) => !i.done).length;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="🗣️" color="#0d9488" title="Agendas" count={openCount} />

      <p className="mb-6 text-sm text-zinc-500">
        Things to bring up next time you talk to someone — instead of interrupting them now.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Person
          </label>
          <input
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            list="agenda-people"
            placeholder="e.g. Jane"
            required
            className="mt-1 w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <datalist id="agenda-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            To discuss
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Ask about Q3 budget"
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
      ) : people.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing queued up. Add something you want to bring up with someone above.
        </p>
      ) : (
        <div className="space-y-6">
          {people.map((person) => (
            <div key={person}>
              <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {person}
              </h2>
              <ul className="space-y-2">
                {grouped.get(person)!.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                  >
                    <label className="flex flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleDone(item)}
                        className="mt-1"
                      />
                      <span
                        className={`text-sm ${
                          item.done
                            ? "text-zinc-400 line-through"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {item.note}
                      </span>
                    </label>
                    <button
                      onClick={() => handleDelete(item.id)}
                      aria-label="Delete agenda item"
                      title="Delete agenda item"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
