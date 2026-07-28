"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { todayLocal } from "@/lib/date";
import { usePageData } from "@/lib/hooks/use-page-data";

// The people layer (SCOPE.md §3.10a): everything involving one person in
// one place — their open tasks (real person_id links), delegations
// (waiting-for among those), and agenda items (matched by name, since
// agendas predate this table and already carry a person_name). Not a CRM;
// a lens over objects that already exist.

type Person = { id: string; name: string; notes: string | null };
type PersonTask = {
  id: string;
  title: string;
  status: string;
  person_id: string | null;
  waiting_for: boolean;
  follow_up_date: string | null;
  due_date: string | null;
  scheduled_date: string | null;
};
type AgendaItem = { id: string; person_name: string; note: string; done: boolean };

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [tasks, setTasks] = useState<PersonTask[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);

  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [linkTaskFor, setLinkTaskFor] = useState<string | null>(null);
  const [linkTaskId, setLinkTaskId] = useState("");

  const { loading, error, setError, reload: loadAll } = usePageData(
    async (signal) => {
      const [peopleRes, tasksRes, agendaRes] = await Promise.all([
        fetch("/api/people", { signal }),
        fetch("/api/tasks", { signal }),
        fetch("/api/agenda-items", { signal }),
      ]);
      if (!peopleRes.ok || !tasksRes.ok || !agendaRes.ok) {
        throw new Error("Failed to load people");
      }
      setPeople(await peopleRes.json());
      setTasks(await tasksRes.json());
      setAgendaItems(await agendaRes.json());
    },
    { tables: ["people", "tasks", "agenda_items"] },
  );

  const openTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const linkableTasks = useMemo(
    () => openTasks.filter((t) => !t.person_id).slice(0, 100),
    [openTasks],
  );

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, notes: newNotes || undefined }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to add person");
      return;
    }
    setNewName("");
    setNewNotes("");
    await loadAll();
  }

  async function handleSaveEdit(person: Person) {
    const res = await fetch(`/api/people/${person.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, notes: editNotes }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save");
      return;
    }
    setEditingId(null);
    await loadAll();
  }

  async function handleDelete(person: Person) {
    if (
      !confirm(
        `Move ${person.name} to trash? Their linked tasks and agenda items stay — only the person entry is trashed (recoverable for 30 days).`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/people/${person.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete");
      return;
    }
    await loadAll();
  }

  async function handleLinkTask(personId: string) {
    if (!linkTaskId) return;
    const res = await fetch(`/api/tasks/${linkTaskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: personId }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to link task");
      return;
    }
    setLinkTaskFor(null);
    setLinkTaskId("");
    await loadAll();
  }

  async function handleUnlinkTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: null }),
    });
    await loadAll();
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-1 text-2xl font-semibold">👤 People</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Everything involving one person, in one place — their tasks, what you&apos;re waiting
        on from them, and what to bring up next time you talk (
        <Link href="/agendas" className="underline">
          Agendas
        </Link>
        , matched by name).
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-8 space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a person — e.g. Goose, Taylor, Lucas"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          placeholder="Notes (optional) — role, context, how you know them"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add person
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No people yet. Add the ones who keep showing up in your Waiting For and Agendas.
        </p>
      ) : (
        <ul className="space-y-4">
          {people.map((person) => {
            const personTasks = openTasks.filter((t) => t.person_id === person.id);
            const waiting = personTasks.filter((t) => t.waiting_for);
            const active = personTasks.filter((t) => !t.waiting_for);
            const agenda = agendaItems.filter(
              (a) => !a.done && a.person_name.trim().toLowerCase() === person.name.trim().toLowerCase(),
            );
            const isEditing = editingId === person.id;

            return (
              <li
                key={person.id}
                className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <input
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notes"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSaveEdit(person)}
                        className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-semibold">{person.name}</p>
                        {person.notes && <p className="text-sm text-zinc-500">{person.notes}</p>}
                      </div>
                      <div className="flex shrink-0 gap-2 text-xs">
                        <button
                          onClick={() => {
                            setEditingId(person.id);
                            setEditName(person.name);
                            setEditNotes(person.notes ?? "");
                          }}
                          className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(person)}
                          className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {waiting.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">
                          ⏳ Waiting on them
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {waiting.map((t) => (
                            <li key={t.id} className="flex items-baseline justify-between gap-2 text-sm">
                              <span>
                                {t.title}
                                {t.follow_up_date && t.follow_up_date <= todayLocal() && (
                                  <span className="ml-1 text-xs text-red-600 dark:text-red-400">
                                    🔔 follow up
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() => handleUnlinkTask(t.id)}
                                className="shrink-0 text-[11px] text-zinc-400 hover:text-zinc-600"
                                title="Unlink from this person"
                              >
                                unlink
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {active.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                          Tasks
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {active.map((t) => (
                            <li key={t.id} className="flex items-baseline justify-between gap-2 text-sm">
                              <span>
                                {t.title}
                                {t.due_date && (
                                  <span className="ml-1 text-xs text-zinc-400">due {t.due_date}</span>
                                )}
                              </span>
                              <button
                                onClick={() => handleUnlinkTask(t.id)}
                                className="shrink-0 text-[11px] text-zinc-400 hover:text-zinc-600"
                                title="Unlink from this person"
                              >
                                unlink
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {agenda.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                          🗣️ Next time you talk
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {agenda.map((a) => (
                            <li key={a.id} className="text-sm">
                              {a.note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {linkTaskFor === person.id ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <select
                          value={linkTaskId}
                          onChange={(e) => setLinkTaskId(e.target.value)}
                          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="">Pick a task to link…</option>
                          {linkableTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleLinkTask(person.id)}
                          disabled={!linkTaskId}
                          className="rounded-md bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          Link
                        </button>
                        <button
                          onClick={() => {
                            setLinkTaskFor(null);
                            setLinkTaskId("");
                          }}
                          className="rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setLinkTaskFor(person.id)}
                        className="mt-3 text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        + Link a task
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
