"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import ColorPicker from "@/components/color-picker";
import ProjectCreateForm from "@/components/project-create-form";
import { type TaskDomain } from "@/components/task-row";
import { renderGroupedTaskRows } from "@/components/recurring-task-group";
import ReorderableTaskList from "@/components/reorderable-task-list";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { findStalledProjectIds } from "@/lib/projects/stalled";
import { useConfirmDialog } from "@/components/confirm-dialog";

export default function DomainsPage() {
  const { confirm } = useConfirmDialog();
  const {
    domains,
    tasks,
    projects,
    loading,
    error,
    setError,
    handleUpdate: handleTaskUpdate,
    toggleDone: toggleTaskDone,
    handleDelete: handleTaskDelete,
    handleConvertToProjectAndPlan: handleTaskConvertToProject,
    handleConvertToRecurring: handleTaskConvertToRecurring,
    handleConvertToKnowledgeItem: handleTaskConvertToKnowledgeItem,
    loadAll,
  } = useTaskList();

  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#6366f1");

  // Per-project quick-add task input (same function the All Projects page has).
  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({});
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);

  // Inline project creation, scoped to one domain — the same create a project
  // can be done from Today, without leaving the Domains page.
  const [creatingFor, setCreatingFor] = useState<string | null>(null);


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
    await loadAll();
  }

  function startEdit(domain: TaskDomain) {
    setEditingId(domain.id);
    setEditName(domain.name);
    setEditColor(domain.color);
  }

  // Project creation here is the same full form (GTD Natural Planning
  // fields and all) as the Projects page — ProjectCreateForm, scoped to
  // this domain — instead of the old name-only mini form.
  const parentProjectOptions = () => projects.filter((p) => !p.parent_project_id);

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
    await loadAll();
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm({
        message:
          "Move this domain to trash? Its projects and tasks move with it, and you can restore them together within 30 days.",
        confirmLabel: "Move to Trash",
        danger: true,
      }))
    ) {
      return;
    }

    const res = await fetch(`/api/domains/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete domain");
      return;
    }

    await loadAll();
  }

  async function handleAddTask(projectId: string, domainId: string | null, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = (newTaskTitles[projectId] ?? "").trim();
    if (!title) return;

    setAddingTaskId(projectId);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, project_id: projectId, domain_id: domainId }),
    });
    setAddingTaskId(null);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return;
    }

    setNewTaskTitles((prev) => ({ ...prev, [projectId]: "" }));
    await loadAll();
  }

  const stalledProjectIds = findStalledProjectIds(
    projects.map((p) => ({
      id: p.id,
      status: p.status ?? "active",
      parent_project_id: p.parent_project_id ?? null,
    })),
    tasks,
  );

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

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1">
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
          <ul className="space-y-2">
          {domains.map((domain) => (
            <li
              key={domain.id}
              className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-3">
                {editingId === domain.id ? (
                  <>
                    <ColorPicker value={editColor} onChange={setEditColor} />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
                      onClick={() => setCreatingFor(creatingFor === domain.id ? null : domain.id)}
                      aria-label="Add project"
                      title="Add project"
                      className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300 ${
                        creatingFor === domain.id
                          ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                          : "text-zinc-400"
                      }`}
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
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                        <path d="M12 11v4M10 13h4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => startEdit(domain)}
                      aria-label="Edit domain"
                      title="Edit domain"
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
                      onClick={() => handleDelete(domain.id)}
                      aria-label="Delete domain"
                      title="Delete domain"
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
                  </>
                )}
              </div>

              {creatingFor === domain.id && editingId !== domain.id && (
                <div className="mt-3 ml-7 edit-swap-in">
                  <ProjectCreateForm
                    domains={domains}
                    projects={projects}
                    parentOptions={parentProjectOptions}
                    domainFilter={domain.id}
                    setError={setError}
                    loadAll={loadAll}
                    onCreated={() => setCreatingFor(null)}
                  />
                  <button
                    type="button"
                    onClick={() => setCreatingFor(null)}
                    className="-mt-6 mb-2 text-sm text-zinc-500 underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {editingId !== domain.id &&
                (() => {
                  const domainProjects = projects.filter((p) => p.domain_id === domain.id);
                  const domainTasks = tasks.filter(
                    (t) => t.domain_id === domain.id && t.status !== "done",
                  );
                  if (domainProjects.length === 0 && domainTasks.length === 0) return null;

                  return (
                    <div className="mt-2 ml-7 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                      {domainTasks.length > 0 && (
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
                            <span className="text-zinc-400 transition-transform group-open:rotate-90">
                              ›
                            </span>
                            All tasks ({domainTasks.length})
                          </summary>
                          <ul className="mt-1.5 space-y-2 pl-4">
                            {renderGroupedTaskRows(domainTasks, {
                              domains,
                              projects,
                              onToggleDone: toggleTaskDone,
                              onUpdate: handleTaskUpdate,
                              onDelete: handleTaskDelete,
                              onConvertToProject: handleTaskConvertToProject,
                              onConvertToRecurring: handleTaskConvertToRecurring,
                              onConvertToKnowledgeItem: handleTaskConvertToKnowledgeItem,
                            })}
                          </ul>
                        </details>
                      )}
                      {domainProjects.map((project) => {
                        const projectTasks = tasks.filter(
                          (t) => t.project_id === project.id && t.status !== "done",
                        );
                        return (
                          <details key={project.id} className="group">
                            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
                              <span className="text-zinc-400 transition-transform group-open:rotate-90">
                                ›
                              </span>
                              {project.name}
                              {project.status !== "active" && (
                                <span className="text-xs text-zinc-400">({project.status})</span>
                              )}
                              <span className="text-xs text-zinc-400">
                                ({projectTasks.length})
                              </span>
                              {stalledProjectIds.has(project.id) && (
                                <span
                                  title="Active, zero open tasks — no next action"
                                  className="text-xs font-medium text-amber-600 dark:text-amber-400"
                                >
                                  ⚠ Stalled
                                </span>
                              )}
                            </summary>
                            {projectTasks.length === 0 ? (
                              <p className="mt-1 pl-4 text-xs text-zinc-500">No open tasks.</p>
                            ) : (
                              <ul className="mt-1.5 space-y-2 pl-4">
                                <ReorderableTaskList
                                  tasks={projectTasks}
                                  onReordered={loadAll}
                                  domains={domains}
                                  projects={projects}
                                  onToggleDone={toggleTaskDone}
                                  onUpdate={handleTaskUpdate}
                                  onDelete={handleTaskDelete}
                                  onConvertToProject={handleTaskConvertToProject}
                                  onConvertToRecurring={handleTaskConvertToRecurring}
                                  onConvertToKnowledgeItem={handleTaskConvertToKnowledgeItem}
                                />
                              </ul>
                            )}
                            <form
                              onSubmit={(e) => handleAddTask(project.id, domain.id, e)}
                              className="mt-1.5 flex gap-2 pl-4"
                            >
                              <input
                                value={newTaskTitles[project.id] ?? ""}
                                onChange={(e) =>
                                  setNewTaskTitles((prev) => ({ ...prev, [project.id]: e.target.value }))
                                }
                                placeholder="Add a task to this project"
                                disabled={addingTaskId === project.id}
                                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                              />
                              <button
                                type="submit"
                                disabled={addingTaskId === project.id || !(newTaskTitles[project.id] ?? "").trim()}
                                className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                              >
                                {addingTaskId === project.id ? "Adding…" : "Add"}
                              </button>
                            </form>
                          </details>
                        );
                      })}
                    </div>
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
