"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { usePageData } from "@/lib/hooks/use-page-data";
import { useListOrder } from "@/lib/hooks/use-list-order";
import { applyListOrder } from "@/lib/tasks/list-order";
import ReorderableTaskList from "@/components/reorderable-task-list";
import TaskRow from "@/components/task-row";
import { type Project, type SupportItem } from "@/lib/projects/types";

/**
 * The project detail page (#139 + #132): one place holding everything a
 * project accumulates — planning fields, open tasks, completed history,
 * and reference material. The Projects page card links here for the
 * pieces that don't belong on a browsing list.
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    handleUpdate,
    toggleDone,
    handleDelete,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
    createTask,
  } = useTaskList<Project>();

  const [supportItems, setSupportItems] = useState<SupportItem[]>([]);
  usePageData(
    async (signal) => {
      const res = await fetch("/api/knowledge-items", { signal });
      if (res.ok) setSupportItems(await res.json());
    },
    { tables: ["knowledge_items"] },
  );

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  // Per-page manual order (#142) — the same key as the Tasks page's
  // project-filtered view, so both surfaces share one arrangement.
  const listKey = `project:${id}`;
  const { positions, refresh: refreshOrder } = useListOrder(listKey);

  const project = projects.find((p) => p.id === id);
  const domain = project?.domain_id ? domains.find((d) => d.id === project.domain_id) : undefined;
  const parentProject = project?.parent_project_id
    ? projects.find((p) => p.id === project.parent_project_id)
    : undefined;
  const subprojects = projects.filter((p) => p.parent_project_id === id);
  const openTasks = applyListOrder(
    tasks.filter((t) => t.project_id === id && t.status !== "done"),
    positions,
  );
  const doneTasks = tasks
    .filter((t) => t.project_id === id && t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const references = supportItems.filter((i) => i.project_id === id);

  async function handleAddTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || !project) return;
    setAddingTask(true);
    const created = await createTask({
      title,
      project_id: project.id,
      domain_id: project.domain_id,
    });
    setAddingTask(false);
    if (created) setNewTaskTitle("");
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <p className="text-sm text-zinc-500">
          This project doesn&apos;t exist (or is in the Trash).{" "}
          <Link href="/projects" className="underline">
            Back to Projects
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <Link
        href="/projects"
        className="text-sm text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
      >
        ← Projects
      </Link>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3 mb-6">
        <div className="flex items-center gap-2">
          {domain && (
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: domain.color }}
            />
          )}
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {project.name}
          </h1>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {project.status}
          {project.priority !== "none" ? ` · ${project.priority} priority` : ""}
          {project.due_date ? ` · due ${project.due_date}` : ""}
          {project.scheduled_date ? ` · scheduled ${project.scheduled_date}` : ""}
          {domain ? ` · ${domain.name}` : ""}
          {parentProject && (
            <>
              {" · part of "}
              <Link href={`/projects/${parentProject.id}`} className="underline">
                {parentProject.name}
              </Link>
            </>
          )}
        </p>
        {project.description && <p className="mt-2 text-sm text-zinc-500">{project.description}</p>}
        {project.purpose && (
          <p className="mt-1 text-xs text-zinc-500">
            <span className="font-medium">Purpose:</span> {project.purpose}
          </p>
        )}
        {project.outcome_vision && (
          <p className="mt-1 text-xs text-zinc-500">
            <span className="font-medium">Done looks like:</span> {project.outcome_vision}
          </p>
        )}
        {project.brainstorm && (
          <p className="mt-1 text-xs text-zinc-500">
            <span className="font-medium">Brainstorm:</span> {project.brainstorm}
          </p>
        )}
        {project.link && (
          <a
            href={project.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {project.link}
          </a>
        )}
      </div>

      {subprojects.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Subprojects
          </h2>
          <ul className="space-y-1">
            {subprojects.map((sub) => (
              <li key={sub.id}>
                <Link
                  href={`/projects/${sub.id}`}
                  className="text-sm text-zinc-700 underline hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  {sub.name}
                </Link>
                <span className="ml-2 text-xs text-zinc-500">{sub.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Tasks {openTasks.length > 0 && `(${openTasks.length})`}
        </h2>
        {openTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No open tasks.</p>
        ) : (
          <ul className="space-y-2">
            <ReorderableTaskList
              tasks={openTasks}
              listKey={listKey}
              onReordered={refreshOrder}
              domains={domains}
              projects={projects}
              onToggleDone={toggleDone}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onConvertToRecurring={handleConvertToRecurring}
              onConvertToKnowledgeItem={handleConvertToKnowledgeItem}
            />
          </ul>
        )}
        <form onSubmit={handleAddTask} className="mt-2 flex flex-wrap gap-2">
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a task to this project"
            disabled={addingTask}
            className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={addingTask || !newTaskTitle.trim()}
            className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {addingTask ? "Adding..." : "Add"}
          </button>
        </form>
      </div>

      {doneTasks.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Completed ({doneTasks.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {doneTasks.map((task) => (
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
        </details>
      )}

      {references.length > 0 && (
        <div className="mb-6 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/60">
          <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Reference</p>
          <ul className="mt-1 space-y-0.5">
            {references.map((item) => (
              <li key={item.id} className="flex items-center gap-1.5 text-sm">
                <span className="text-xs">📖</span>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-blue-600 underline dark:text-blue-400"
                  >
                    {item.title}
                  </a>
                ) : (
                  <Link href="/library" className="truncate hover:underline">
                    {item.title}
                  </Link>
                )}
                <span className="text-xs text-zinc-400">{item.type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
