"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TaskRow, {
  type Task,
  type TaskDomain,
  type TaskProject,
  type TaskPriority,
} from "@/components/task-row";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];

type ProjectWithDomain = TaskProject & { domain_id: string | null };

export default function TasksPage() {
  const searchParams = useSearchParams();
  const domainFilter = searchParams.get("domain");
  const projectFilter = searchParams.get("project");
  const searchQuery = searchParams.get("q");

  const [domains, setDomains] = useState<TaskDomain[]>([]);
  const [projects, setProjects] = useState<ProjectWithDomain[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [domainId, setDomainId] = useState(domainFilter ?? "");
  const [projectId, setProjectId] = useState(projectFilter ?? "");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDomainId, setBulkDomainId] = useState("");
  const [bulkFiling, setBulkFiling] = useState(false);

  async function loadAll() {
    try {
      const [domainsRes, projectsRes, tasksRes] = await Promise.all([
        fetch("/api/domains"),
        fetch("/api/projects"),
        fetch("/api/tasks"),
      ]);
      if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
        throw new Error("Failed to load tasks");
      }
      setDomains(await domainsRes.json());
      setProjects(await projectsRes.json());
      setTasks(await tasksRes.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };

    Promise.all([
      fetch("/api/domains", opts),
      fetch("/api/projects", opts),
      fetch("/api/tasks", opts),
    ])
      .then(async ([domainsRes, projectsRes, tasksRes]) => {
        if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
          throw new Error("Failed to load tasks");
        }
        return Promise.all([domainsRes.json(), projectsRes.json(), tasksRes.json()]);
      })
      .then(([domainsData, projectsData, tasksData]) => {
        setDomains(domainsData);
        setProjects(projectsData);
        setTasks(tasksData);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  useRealtimeRefresh(["tasks", "domains", "projects"], () => loadAll());

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        notes: notes || undefined,
        domain_id: domainId || null,
        project_id: projectId || null,
        priority,
        due_date: dueDate || undefined,
        scheduled_date: scheduledDate || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return;
    }

    setTitle("");
    setNotes("");
    setDomainId("");
    setProjectId("");
    setPriority("none");
    setDueDate("");
    setScheduledDate("");
    await loadAll();
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update task");
      return;
    }

    await loadAll();
  }

  async function toggleDone(task: Task) {
    await handleUpdate(task.id, { status: task.status === "done" ? "todo" : "done" });
  }

  async function handleDelete(id: string) {
    if (!confirm("Move this task to trash? You can restore it within 30 days.")) return;

    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete task");
      return;
    }

    await loadAll();
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
    setBulkDomainId("");
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleBulkFile() {
    if (!bulkDomainId || selectedIds.size === 0) return;

    setBulkFiling(true);
    const results = await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain_id: bulkDomainId }),
        }),
      ),
    );
    setBulkFiling(false);

    if (results.some((res) => !res.ok)) {
      setError("Some tasks couldn't be filed — try again.");
    }

    setSelectedIds(new Set());
    setBulkDomainId("");
    setSelectMode(false);
    await loadAll();
  }

  const inboxTasks = tasks.filter((t) => !t.domain_id && t.status !== "done");
  const processedTasks = tasks.filter((t) => t.domain_id && t.status !== "done");

  const filteredTasks = searchQuery
    ? tasks.filter(
        (t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()) && t.status !== "done",
      )
    : domainFilter
      ? tasks.filter((t) => t.domain_id === domainFilter && t.status !== "done")
      : projectFilter
        ? tasks.filter((t) => t.project_id === projectFilter && t.status !== "done")
        : null;
  const filterLabel = searchQuery
    ? `"${searchQuery}"`
    : domainFilter
      ? (domains.find((d) => d.id === domainFilter)?.name ?? "this domain")
      : (projects.find((p) => p.id === projectFilter)?.name ?? "this project");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Tasks
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {(searchQuery || domainFilter || projectFilter) && (
        <p className="mb-4 text-sm text-zinc-500">
          {searchQuery ? "Showing tasks matching" : "Showing tasks in"}{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{filterLabel}</strong>
          {" — "}
          <Link href="/tasks" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
            Clear filter
          </Link>
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            New task
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call the dentist"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
              <option value="">No domain (stays in Inbox)</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="project"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Project
            </label>
            <select
              id="project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
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
              onChange={(e) => {
                const value = e.target.value;
                setDueDate(value);
                if (value && !scheduledDate) setScheduledDate(value);
              }}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="scheduled_date"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Scheduled
            </label>
            <input
              id="scheduled_date"
              type="date"
              value={scheduledDate}
              onChange={(e) => {
                const value = e.target.value;
                setScheduledDate(value);
                if (value && !dueDate) setDueDate(value);
              }}
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
      ) : filteredTasks ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Tasks {filteredTasks.length > 0 && `(${filteredTasks.length})`}
          </h2>
          {filteredTasks.length === 0 ? (
            <p className="text-sm text-zinc-500">No tasks here yet.</p>
          ) : (
            <ul className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  domains={domains}
                  projects={projects}
                  onToggleDone={toggleDone}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Inbox {inboxTasks.length > 0 && `(${inboxTasks.length})`}
              </h2>
              {inboxTasks.length > 0 && (
                <button
                  onClick={toggleSelectMode}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                >
                  {selectMode ? "Cancel" : "Select"}
                </button>
              )}
            </div>

            {selectMode && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === inboxTasks.length}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? new Set(inboxTasks.map((t) => t.id)) : new Set())
                    }
                  />
                  Select all
                </label>
                <span className="text-sm text-zinc-500">{selectedIds.size} selected</span>
                <select
                  value={bulkDomainId}
                  onChange={(e) => setBulkDomainId(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">File to domain...</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleBulkFile}
                  disabled={!bulkDomainId || selectedIds.size === 0 || bulkFiling}
                  className="rounded-md bg-zinc-950 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {bulkFiling ? "Filing..." : `File ${selectedIds.size || ""}`}
                </button>
              </div>
            )}

            {inboxTasks.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nothing unprocessed — inbox is clear.
              </p>
            ) : (
              <ul className="space-y-2">
                {inboxTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    domains={domains}
                    projects={projects}
                    onToggleDone={toggleDone}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    selectable={selectMode}
                    selected={selectedIds.has(task.id)}
                    onSelectChange={(checked) => toggleSelected(task.id, checked)}
                  />
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              By domain {processedTasks.length > 0 && `(${processedTasks.length})`}
            </h2>
            {domains.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No domains yet —{" "}
                <Link href="/domains" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
                  create one
                </Link>{" "}
                to start organizing tasks.
              </p>
            ) : (
              <div className="space-y-6">
                {domains.map((domain) => {
                  const domainProjects = projects.filter((p) => p.domain_id === domain.id);
                  const domainTasks = processedTasks.filter((t) => t.domain_id === domain.id);
                  const unfiledDomainTasks = domainTasks.filter((t) => !t.project_id);

                  return (
                    <div key={domain.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: domain.color }}
                        />
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {domain.name}
                        </h3>
                        {domainTasks.length > 0 && (
                          <span className="text-xs text-zinc-500">({domainTasks.length})</span>
                        )}
                        <Link
                          href={`/tasks?domain=${domain.id}`}
                          aria-label="View all tasks"
                          title="View all tasks"
                          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 6h11M9 12h11M9 18h11" />
                            <path d="M4 6h.01M4 12h.01M4 18h.01" />
                          </svg>
                        </Link>
                      </div>

                      {domainProjects.length === 0 && domainTasks.length === 0 ? (
                        <p className="ml-[1.375rem] text-sm text-zinc-500">
                          No projects or tasks yet.
                        </p>
                      ) : (
                        <div className="ml-[1.375rem] space-y-4">
                          {domainProjects.map((project) => {
                            const projectTasks = domainTasks.filter(
                              (t) => t.project_id === project.id,
                            );
                            return (
                              <div key={project.id}>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                  {project.name}
                                </p>
                                {projectTasks.length === 0 ? (
                                  <p className="text-sm text-zinc-500">No tasks yet.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {projectTasks.map((task) => (
                                      <TaskRow
                                        key={task.id}
                                        task={task}
                                        domains={domains}
                                        projects={projects}
                                        onToggleDone={toggleDone}
                                        onUpdate={handleUpdate}
                                        onDelete={handleDelete}
                                      />
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}

                          {unfiledDomainTasks.length > 0 && (
                            <div>
                              {domainProjects.length > 0 && (
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                  No project
                                </p>
                              )}
                              <ul className="space-y-2">
                                {unfiledDomainTasks.map((task) => (
                                  <TaskRow
                                    key={task.id}
                                    task={task}
                                    domains={domains}
                                    projects={projects}
                                    onToggleDone={toggleDone}
                                    onUpdate={handleUpdate}
                                    onDelete={handleDelete}
                                  />
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
