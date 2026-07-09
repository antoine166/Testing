"use client";

import { useEffect, useState, type FormEvent } from "react";

type Domain = {
  id: string;
  name: string;
  color: string;
};

type ProjectStatus = "active" | "someday" | "completed" | "archived";

type Project = {
  id: string;
  domain_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  due_date: string | null;
  created_at: string;
};

const STATUSES: ProjectStatus[] = ["active", "someday", "completed", "archived"];
const NO_DOMAIN_KEY = "__none__";

export default function ProjectsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domainId, setDomainId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [dueDate, setDueDate] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDomainId, setEditDomainId] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectStatus>("active");
  const [editDueDate, setEditDueDate] = useState("");

  async function loadAll() {
    try {
      const [domainsRes, projectsRes] = await Promise.all([
        fetch("/api/domains"),
        fetch("/api/projects"),
      ]);
      if (!domainsRes.ok || !projectsRes.ok) {
        throw new Error("Failed to load projects");
      }
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
        if (!domainsRes.ok || !projectsRes.ok) {
          throw new Error("Failed to load projects");
        }
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

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        domain_id: domainId || null,
        status,
        due_date: dueDate || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create project");
      return;
    }

    setName("");
    setDescription("");
    setDomainId("");
    setStatus("active");
    setDueDate("");
    await loadAll();
  }

  function startEdit(project: Project) {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setEditDomainId(project.domain_id ?? "");
    setEditStatus(project.status);
    setEditDueDate(project.due_date ?? "");
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;

    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        description: editDescription,
        domain_id: editDomainId || null,
        status: editStatus,
        due_date: editDueDate || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update project");
      return;
    }

    setEditingId(null);
    await loadAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project? Its tasks will be unassigned, not deleted.")) {
      return;
    }

    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete project");
      return;
    }

    await loadAll();
  }

  const domainsById = new Map(domains.map((d) => [d.id, d]));
  const grouped = new Map<string, Project[]>();
  for (const project of projects) {
    const key = project.domain_id ?? NO_DOMAIN_KEY;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(project);
  }
  const groupKeys = [
    ...domains.map((d) => d.id).filter((id) => grouped.has(id)),
    ...(grouped.has(NO_DOMAIN_KEY) ? [NO_DOMAIN_KEY] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Projects
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            New project
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kitchen remodel"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Description (optional)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="domain"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Domain
            </label>
            <select
              id="domain"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No domain</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="due_date"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Due date
            </label>
            <input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Add
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No projects yet. Add your first one above.
        </p>
      ) : (
        <div className="space-y-6">
          {groupKeys.map((key) => {
            const domain = key === NO_DOMAIN_KEY ? null : domainsById.get(key);
            const groupProjects = grouped.get(key) ?? [];

            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2">
                  {domain && (
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: domain.color }}
                    />
                  )}
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {domain ? domain.name : "No domain"}
                  </h2>
                </div>
                <ul className="space-y-2">
                  {groupProjects.map((project) => (
                    <li
                      key={project.id}
                      className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
                    >
                      {editingId === project.id ? (
                        <div className="space-y-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          />
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={editDomainId}
                              onChange={(e) => setEditDomainId(e.target.value)}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            >
                              <option value="">No domain</option>
                              {domains.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={editStatus}
                              onChange={(e) =>
                                setEditStatus(e.target.value as ProjectStatus)
                              }
                              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <input
                              type="date"
                              value={editDueDate}
                              onChange={(e) => setEditDueDate(e.target.value)}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <button
                              onClick={() => handleUpdate(project.id)}
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
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {project.name}
                            </p>
                            {project.description && (
                              <p className="mt-0.5 text-sm text-zinc-500">
                                {project.description}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-zinc-500">
                              {project.status}
                              {project.due_date ? ` · due ${project.due_date}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-3">
                            <button
                              onClick={() => startEdit(project)}
                              className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(project.id)}
                              className="text-sm font-medium text-red-600 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
