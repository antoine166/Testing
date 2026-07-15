"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import ColorPicker from "@/components/color-picker";

type Domain = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  created_at: string;
  sort_order: number;
};

type Project = {
  id: string;
  name: string;
  domain_id: string | null;
  status: string;
};

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#6366f1");

  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function loadDomains() {
    try {
      const [domainsRes, projectsRes] = await Promise.all([
        fetch("/api/domains"),
        fetch("/api/projects"),
      ]);
      if (!domainsRes.ok || !projectsRes.ok) throw new Error("Failed to load domains");
      setDomains(await domainsRes.json());
      setProjects(await projectsRes.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch("/api/domains", { signal: controller.signal }),
      fetch("/api/projects", { signal: controller.signal }),
    ])
      .then(async ([domainsRes, projectsRes]) => {
        if (!domainsRes.ok || !projectsRes.ok) throw new Error("Failed to load domains");
        return Promise.all([domainsRes.json(), projectsRes.json()]);
      })
      .then(([domainsData, projectsData]: [Domain[], Project[]]) => {
        setDomains(domainsData);
        setProjects(projectsData);
      })
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
        "Move this domain to trash? Its projects and tasks move with it, and you can restore them together within 30 days.",
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

  function handleDragStart(id: string) {
    setDraggedId(id);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    setDomains((prev) => {
      const fromIndex = prev.findIndex((d) => d.id === draggedId);
      const toIndex = prev.findIndex((d) => d.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function handleDragEnd() {
    if (!draggedId) return;
    setDraggedId(null);

    const results = await Promise.all(
      domains.map((d, i) =>
        fetch(`/api/domains/${d.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: i }),
        }),
      ),
    );

    if (results.some((r) => !r.ok)) {
      setError("Couldn't save the new order — try again.");
    }
    await loadDomains();
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Domains
      </h1>

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
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Color
          </label>
          <div className="mt-1">
            <ColorPicker value={color} onChange={setColor} />
          </div>
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
        <>
          <p className="mb-2 text-xs text-zinc-500">Drag to reorder — this order is used everywhere domains are grouped.</p>
          <ul className="space-y-2">
          {domains.map((domain) => (
            <li
              key={domain.id}
              draggable={editingId !== domain.id}
              onDragStart={() => handleDragStart(domain.id)}
              onDragOver={(e) => handleDragOver(e, domain.id)}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={handleDragEnd}
              className={`rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800 ${
                editingId === domain.id ? "" : "cursor-grab active:cursor-grabbing"
              } ${draggedId === domain.id ? "opacity-40" : ""}`}
            >
              <div className="flex items-center gap-3">
                {editingId !== domain.id && (
                  <span className="select-none text-zinc-300 dark:text-zinc-600" aria-hidden>
                    ⠿
                  </span>
                )}
                {editingId === domain.id ? (
                  <>
                    <ColorPicker value={editColor} onChange={setEditColor} />
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
                    <Link
                      href={`/tasks?domain=${domain.id}`}
                      className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                    >
                      Tasks
                    </Link>
                    <Link
                      href={`/projects?domain=${domain.id}`}
                      className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                    >
                      + Project
                    </Link>
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
              </div>

              {editingId !== domain.id &&
                (() => {
                  const domainProjects = projects.filter((p) => p.domain_id === domain.id);
                  if (domainProjects.length === 0) return null;
                  return (
                    <ul className="mt-2 ml-7 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                      {domainProjects.map((project) => (
                        <li key={project.id}>
                          <Link
                            href={`/tasks?project=${project.id}`}
                            className="block text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                          >
                            {project.name}
                            {project.status !== "active" && (
                              <span className="ml-1.5 text-xs text-zinc-400">
                                ({project.status})
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
            </li>
          ))}
          </ul>
        </>
      )}
    </div>
  );
}
