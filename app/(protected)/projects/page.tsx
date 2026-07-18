"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

type Domain = {
  id: string;
  name: string;
  color: string;
};

type ProjectStatus = "active" | "someday" | "completed" | "archived";
type ProjectPriority = "none" | "low" | "medium" | "high";

type Project = {
  id: string;
  domain_id: string | null;
  parent_project_id: string | null;
  name: string;
  description: string | null;
  purpose: string | null;
  outcome_vision: string | null;
  brainstorm: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  due_date: string | null;
  scheduled_date: string | null;
  link: string | null;
  created_at: string;
};

type ProjectTask = { project_id: string | null; status: "todo" | "in_progress" | "done" };

const STATUSES: ProjectStatus[] = ["active", "someday", "completed", "archived"];
const PRIORITIES: ProjectPriority[] = ["none", "low", "medium", "high"];
const NO_DOMAIN_KEY = "__none__";

function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const domainFilter = searchParams.get("domain");

  const [domains, setDomains] = useState<Domain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outcomeVision, setOutcomeVision] = useState("");
  const [brainstorm, setBrainstorm] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [domainId, setDomainId] = useState(domainFilter ?? "");
  const [parentProjectId, setParentProjectId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [priority, setPriority] = useState<ProjectPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [link, setLink] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editOutcomeVision, setEditOutcomeVision] = useState("");
  const [editBrainstorm, setEditBrainstorm] = useState("");
  const [editDomainId, setEditDomainId] = useState("");
  const [editParentProjectId, setEditParentProjectId] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectStatus>("active");
  const [editPriority, setEditPriority] = useState<ProjectPriority>("none");
  const [editDueDate, setEditDueDate] = useState("");
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editLink, setEditLink] = useState("");

  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({});
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [domainsRes, projectsRes, tasksRes] = await Promise.all([
        fetch("/api/domains"),
        fetch("/api/projects"),
        fetch("/api/tasks"),
      ]);
      if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
        throw new Error("Failed to load projects");
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

    Promise.all([
      fetch("/api/domains", { signal: controller.signal }),
      fetch("/api/projects", { signal: controller.signal }),
      fetch("/api/tasks", { signal: controller.signal }),
    ])
      .then(async ([domainsRes, projectsRes, tasksRes]) => {
        if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
          throw new Error("Failed to load projects");
        }
        return Promise.all([domainsRes.json(), projectsRes.json(), tasksRes.json()]);
      })
      .then(([domainsData, projectsData, tasksData]: [Domain[], Project[], ProjectTask[]]) => {
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

  useRealtimeRefresh(["projects", "domains", "tasks"], () => loadAll());

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        purpose: purpose || undefined,
        outcome_vision: outcomeVision || undefined,
        brainstorm: brainstorm || undefined,
        domain_id: domainId || null,
        parent_project_id: parentProjectId || null,
        status,
        priority,
        due_date: dueDate || undefined,
        scheduled_date: scheduledDate || undefined,
        link: link || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create project");
      return;
    }

    const project = await res.json();

    if (nextAction.trim()) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextAction,
          project_id: project.id,
          domain_id: domainId || null,
        }),
      });
    }

    setName("");
    setDescription("");
    setPurpose("");
    setOutcomeVision("");
    setBrainstorm("");
    setNextAction("");
    setDomainId("");
    setParentProjectId("");
    setStatus("active");
    setPriority("none");
    setDueDate("");
    setScheduledDate("");
    setLink("");
    await loadAll();
  }

  function selectParentProject(id: string) {
    setParentProjectId(id);
    if (id) {
      const parent = projects.find((p) => p.id === id);
      setDomainId(parent?.domain_id ?? "");
    }
  }

  function selectEditParentProject(id: string) {
    setEditParentProjectId(id);
    if (id) {
      const parent = projects.find((p) => p.id === id);
      setEditDomainId(parent?.domain_id ?? "");
    }
  }

  function startEdit(project: Project) {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setEditPurpose(project.purpose ?? "");
    setEditOutcomeVision(project.outcome_vision ?? "");
    setEditBrainstorm(project.brainstorm ?? "");
    setEditDomainId(project.domain_id ?? "");
    setEditParentProjectId(project.parent_project_id ?? "");
    setEditStatus(project.status);
    setEditPriority(project.priority);
    setEditDueDate(project.due_date ?? "");
    setEditScheduledDate(project.scheduled_date ?? "");
    setEditLink(project.link ?? "");
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;

    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        description: editDescription,
        purpose: editPurpose,
        outcome_vision: editOutcomeVision,
        brainstorm: editBrainstorm,
        domain_id: editDomainId || null,
        parent_project_id: editParentProjectId || null,
        status: editStatus,
        priority: editPriority,
        due_date: editDueDate || null,
        scheduled_date: editScheduledDate || null,
        link: editLink || null,
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

  async function handleAddTask(project: Project, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = (newTaskTitles[project.id] ?? "").trim();
    if (!title) return;

    setAddingTaskId(project.id);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        project_id: project.id,
        domain_id: project.domain_id,
      }),
    });
    setAddingTaskId(null);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return;
    }

    setNewTaskTitles((prev) => ({ ...prev, [project.id]: "" }));
    await loadAll();
  }

  async function handleDelete(id: string) {
    const hasSubprojects = projects.some((p) => p.parent_project_id === id);
    const message = hasSubprojects
      ? "Move this project to trash? Its subprojects and all their tasks move with it, and you can restore them together within 30 days."
      : "Move this project to trash? Its tasks move with it, and you can restore them together within 30 days.";
    if (!confirm(message)) {
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

  const openTaskCountByProject = new Map<string, number>();
  for (const t of tasks) {
    if (!t.project_id || t.status === "done") continue;
    openTaskCountByProject.set(t.project_id, (openTaskCountByProject.get(t.project_id) ?? 0) + 1);
  }

  const childrenByParent = new Map<string, Project[]>();
  for (const project of projects) {
    if (!project.parent_project_id) continue;
    if (!childrenByParent.has(project.parent_project_id)) {
      childrenByParent.set(project.parent_project_id, []);
    }
    childrenByParent.get(project.parent_project_id)!.push(project);
  }

  function openTaskCount(project: Project): number {
    const own = openTaskCountByProject.get(project.id) ?? 0;
    const children = childrenByParent.get(project.id) ?? [];
    return own + children.reduce((sum, child) => sum + (openTaskCountByProject.get(child.id) ?? 0), 0);
  }
  function isStalled(project: Project) {
    return project.status === "active" && !openTaskCount(project);
  }

  const topLevelProjects = projects.filter((p) => !p.parent_project_id);
  const parentOptions = (excludeId?: string) =>
    topLevelProjects.filter((p) => p.id !== excludeId);

  const domainsById = new Map(domains.map((d) => [d.id, d]));
  const grouped = new Map<string, Project[]>();
  for (const project of topLevelProjects) {
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
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
            Define this project (GTD Natural Planning)
          </summary>
          <div className="mt-2 space-y-3 pl-4">
            <div>
              <label
                htmlFor="purpose"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Purpose — why does this matter?
              </label>
              <textarea
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label
                htmlFor="outcome_vision"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Outcome vision — what does &ldquo;done&rdquo; look like?
              </label>
              <textarea
                id="outcome_vision"
                value={outcomeVision}
                onChange={(e) => setOutcomeVision(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label
                htmlFor="brainstorm"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Brainstorm — ideas, approaches, things to consider
              </label>
              <textarea
                id="brainstorm"
                value={brainstorm}
                onChange={(e) => setBrainstorm(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label
                htmlFor="next_action"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Next action — the very next physical step
              </label>
              <input
                id="next_action"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="e.g. Draft the outline"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">
                If filled in, creates this as the first task in the project.
              </p>
            </div>
          </div>
        </details>
        <div>
          <label
            htmlFor="link"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Link (optional)
          </label>
          <input
            id="link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="e.g. a shared doc or spec"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="parent_project"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Parent project
            </label>
            <select
              id="parent_project"
              value={parentProjectId}
              onChange={(e) => selectParentProject(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">None (top-level project)</option>
              {parentOptions().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
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
              disabled={!!parentProjectId}
              onChange={(e) => setDomainId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No domain</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {parentProjectId && (
              <p className="mt-1 text-xs text-zinc-500">Inherits the parent&apos;s domain.</p>
            )}
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
              htmlFor="priority"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as ProjectPriority)}
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
                  {groupProjects.map((project) => renderProjectItem(project))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  function renderProjectItem(project: Project) {
    const isSub = !!project.parent_project_id;
    const children = childrenByParent.get(project.id) ?? [];
    const canBecomeSubproject = editingId !== project.id || children.length === 0;

    return (
      <Fragment key={project.id}>
        <li>
        <div
          className={`rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800 ${
            isSub ? "ml-6 border-l-2" : ""
          }`}
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
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
                  GTD Natural Planning
                </summary>
                <div className="mt-2 space-y-2 pl-4">
                  <textarea
                    value={editPurpose}
                    onChange={(e) => setEditPurpose(e.target.value)}
                    placeholder="Purpose — why does this matter?"
                    rows={2}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <textarea
                    value={editOutcomeVision}
                    onChange={(e) => setEditOutcomeVision(e.target.value)}
                    placeholder="Outcome vision — what does &quot;done&quot; look like?"
                    rows={2}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <textarea
                    value={editBrainstorm}
                    onChange={(e) => setEditBrainstorm(e.target.value)}
                    placeholder="Brainstorm — ideas, approaches, things to consider"
                    rows={3}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
              </details>
              <input
                type="url"
                value={editLink}
                onChange={(e) => setEditLink(e.target.value)}
                placeholder="Link (optional)"
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={editParentProjectId}
                  disabled={!canBecomeSubproject}
                  onChange={(e) => selectEditParentProject(e.target.value)}
                  title={
                    canBecomeSubproject
                      ? undefined
                      : "This project has its own subprojects, so it can't become a subproject itself."
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">None (top-level project)</option>
                  {parentOptions(project.id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={editDomainId}
                  disabled={!!editParentProjectId}
                  onChange={(e) => setEditDomainId(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
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
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as ProjectPriority)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditDueDate(value);
                    if (value && !editScheduledDate) setEditScheduledDate(value);
                  }}
                  title="Due date"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  type="date"
                  value={editScheduledDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditScheduledDate(value);
                    if (value && !editDueDate) setEditDueDate(value);
                  }}
                  title="Scheduled date"
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
            <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {project.name}
                </p>
                {project.description && (
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {project.description}
                  </p>
                )}
                {project.purpose && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    <span className="font-medium">Purpose:</span> {project.purpose}
                  </p>
                )}
                {project.outcome_vision && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    <span className="font-medium">Done looks like:</span> {project.outcome_vision}
                  </p>
                )}
                {project.brainstorm && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    <span className="font-medium">Brainstorm:</span> {project.brainstorm}
                  </p>
                )}
                {project.link && (
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {linkLabel(project.link)}
                  </a>
                )}
                <p className="mt-1 text-xs text-zinc-500">
                  {project.status}
                  {project.priority !== "none" ? ` · ${project.priority} priority` : ""}
                  {project.due_date ? ` · due ${project.due_date}` : ""}
                  {project.scheduled_date ? ` · scheduled ${project.scheduled_date}` : ""}
                </p>
                {isStalled(project) && (
                  <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    ⚠ Stalled — no next action. Add a task to move this forward.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/tasks?project=${project.id}`}
                  aria-label="View tasks"
                  title="View tasks"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6h11M9 12h11M9 18h11" />
                    <path d="M4 6h.01M4 12h.01M4 18h.01" />
                  </svg>
                </Link>
                <button
                  onClick={() => startEdit(project)}
                  aria-label="Edit project"
                  title="Edit project"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(project.id)}
                  aria-label="Delete project"
                  title="Delete project"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
            <form
              onSubmit={(e) => handleAddTask(project, e)}
              className="mt-2 flex flex-wrap gap-2"
            >
              <input
                value={newTaskTitles[project.id] ?? ""}
                onChange={(e) =>
                  setNewTaskTitles((prev) => ({ ...prev, [project.id]: e.target.value }))
                }
                placeholder="Add a task to this project"
                disabled={addingTaskId === project.id}
                className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="submit"
                disabled={addingTaskId === project.id || !(newTaskTitles[project.id] ?? "").trim()}
                className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {addingTaskId === project.id ? "Adding..." : "Add"}
              </button>
            </form>
            </>
          )}
        </div>
      </li>
      {!isSub && children.map((child) => renderProjectItem(child))}
      </Fragment>
    );
  }
}
