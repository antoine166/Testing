"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Domain = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  created_at: string;
};

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#6366f1");

  async function loadDomains() {
    try {
      const res = await fetch("/api/domains");
      if (!res.ok) throw new Error("Failed to load domains");
      setDomains(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/domains", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load domains");
        return res.json();
      })
      .then((data: Domain[]) => setDomains(data))
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

    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create domain");
      return;
    }

    setName("");
    setColor("#6366f1");
    await loadDomains();
  }

  function startEdit(domain: Domain) {
    setEditingId(domain.id);
    setEditName(domain.name);
    setEditColor(domain.color);
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;

    const res = await fetch(`/api/domains/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, color: editColor }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update domain");
      return;
    }

    setEditingId(null);
    await loadDomains();
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Delete this domain? Projects and tasks in it will be unassigned, not deleted.",
      )
    ) {
      return;
    }

    const res = await fetch(`/api/domains/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete domain");
      return;
    }

    await loadDomains();
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Domains
        </h1>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Back home
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={handleCreate} className="mb-8 flex items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            New domain
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Health"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="color"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Color
          </label>
          <input
            id="color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="mt-1 h-9 w-12 rounded-md border border-zinc-300 dark:border-zinc-700"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : domains.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No domains yet. Add your first one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {domains.map((domain) => (
            <li
              key={domain.id}
              className="flex items-center gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              {editingId === domain.id ? (
                <>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-8 w-10 rounded-md border border-zinc-300 dark:border-zinc-700"
                  />
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    onClick={() => handleUpdate(domain.id)}
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
                </>
              ) : (
                <>
                  <span
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: domain.color }}
                  />
                  <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">
                    {domain.name}
                  </span>
                  <button
                    onClick={() => startEdit(domain)}
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(domain.id)}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
