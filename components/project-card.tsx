"use client";

import { Fragment, type Dispatch, type FormEvent, type SetStateAction } from "react";
import Link from "next/link";
import ReorderableTaskList from "@/components/reorderable-task-list";
import { type Task, type TaskDomain } from "@/components/task-row";
import { type RecurrencePatternDraft } from "@/components/recurrence-fields";
import {
  PRIORITIES,
  STATUSES,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
  type SupportItem,
} from "@/lib/projects/types";

function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type ProjectCardProps = {
  project: Project;
  childrenByParent: Map<string, Project[]>;
  celebratingId: string | null;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editName: string;
  setEditName: (value: string) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  editPurpose: string;
  setEditPurpose: (value: string) => void;
  editOutcomeVision: string;
  setEditOutcomeVision: (value: string) => void;
  editBrainstorm: string;
  setEditBrainstorm: (value: string) => void;
  editDomainId: string;
  setEditDomainId: (value: string) => void;
  editParentProjectId: string;
  selectEditParentProject: (id: string) => void;
  editStatus: ProjectStatus;
  setEditStatus: (value: ProjectStatus) => void;
  editPriority: ProjectPriority;
  setEditPriority: (value: ProjectPriority) => void;
  editDueDate: string;
  setEditDueDate: (value: string) => void;
  editScheduledDate: string;
  setEditScheduledDate: (value: string) => void;
  editLink: string;
  setEditLink: (value: string) => void;
  editReviewEveryDays: string;
  setEditReviewEveryDays: (value: string) => void;
  parentOptions: (excludeId?: string) => Project[];
  domains: TaskDomain[];
  projects: Project[];
  handleUpdate: (id: string) => Promise<void>;
  startEdit: (project: Project) => void;
  handleDelete: (id: string) => Promise<void>;
  handleCompleteProject: (project: Project) => Promise<void>;
  handleSaveAsTemplate: (project: Project) => Promise<void>;
  isStalled: (project: Project) => boolean;
  supportItems: SupportItem[];
  tasks: Task[];
  loadAll: () => Promise<void>;
  toggleTaskDone: (task: Task) => Promise<boolean>;
  handleTaskUpdate: (id: string, updates: Record<string, unknown>) => Promise<boolean>;
  handleTaskDelete: (id: string, scope?: "skip" | "following", skipConfirm?: boolean) => Promise<boolean>;
  handleTaskConvertToRecurring: (id: string, pattern: RecurrencePatternDraft) => Promise<boolean>;
  handleTaskConvertToKnowledgeItem: (id: string, skipConfirm?: boolean) => Promise<boolean>;
  newTaskTitles: Record<string, string>;
  setNewTaskTitles: Dispatch<SetStateAction<Record<string, string>>>;
  addingTaskId: string | null;
  handleAddTask: (project: Project, e: FormEvent<HTMLFormElement>) => Promise<void>;
};

export default function ProjectCard(props: ProjectCardProps) {
  const {
    project, childrenByParent, celebratingId, editingId, setEditingId,
    editName, setEditName, editDescription, setEditDescription,
    editPurpose, setEditPurpose, editOutcomeVision, setEditOutcomeVision,
    editBrainstorm, setEditBrainstorm, editDomainId, setEditDomainId,
    editParentProjectId, selectEditParentProject, editStatus, setEditStatus,
    editPriority, setEditPriority, editDueDate, setEditDueDate,
    editScheduledDate, setEditScheduledDate, editLink, setEditLink,
    editReviewEveryDays, setEditReviewEveryDays,
    parentOptions, domains, projects,
    handleUpdate, startEdit, handleDelete, handleCompleteProject,
    handleSaveAsTemplate, isStalled, supportItems, tasks, loadAll,
    toggleTaskDone, handleTaskUpdate, handleTaskDelete,
    handleTaskConvertToRecurring, handleTaskConvertToKnowledgeItem,
    newTaskTitles, setNewTaskTitles, addingTaskId, handleAddTask,
  } = props;

  const isSub = !!project.parent_project_id;
  const children = childrenByParent.get(project.id) ?? [];
  const canBecomeSubproject = editingId !== project.id || children.length === 0;

  return (
    <Fragment>
      <li>
      <div
        className={`relative rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800 ${
          isSub ? "ml-6 border-l-2" : ""
        } ${celebratingId === project.id ? "project-celebrate-card" : ""}`}
      >
        {celebratingId === project.id && (
          <span className="pointer-events-none absolute inset-0 z-10 overflow-visible">
            <span className="project-celebrate-ring" />
            <span className="project-celebrate-ring project-celebrate-ring-2" />
            <span className="project-celebrate-ring project-celebrate-ring-3" />
            <span className="project-celebrate-emoji absolute inset-0 flex items-center justify-center text-5xl">
              🎉
            </span>
          </span>
        )}
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
                }}
                title="Scheduled date"
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <label
                className="flex items-center gap-1 text-xs text-zinc-500"
                title="How often this project needs a look in the Weekly Review. Blank = every review."
              >
                Review every
                <input
                  type="number"
                  min="1"
                  value={editReviewEveryDays}
                  onChange={(e) => setEditReviewEveryDays(e.target.value)}
                  placeholder="—"
                  className="w-14 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                days
              </label>
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
                <Link href={`/projects/${project.id}`} className="hover:underline">
                  {project.name}
                </Link>
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
                onClick={() => handleSaveAsTemplate(project)}
                aria-label="Save as template"
                title="Save as template — reuse this project's shape (fields + open tasks)"
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
                  <rect x="8" y="8" width="12" height="12" rx="2" />
                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                </svg>
              </button>
              <Link
                href={`/plan?project=${project.id}`}
                aria-label="Plan project (Natural Planning Model)"
                title="Plan project (Natural Planning Model)"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
              >
                🧭
              </Link>
              {project.status !== "completed" && (
                <button
                  onClick={() => handleCompleteProject(project)}
                  aria-label="Complete project"
                  title="Complete project"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
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
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </button>
              )}
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
          {supportItems.some((item) => item.project_id === project.id) && (
            <div className="mt-2 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Reference
              </p>
              <ul className="mt-1 space-y-0.5">
                {supportItems
                  .filter((item) => item.project_id === project.id)
                  .map((item) => (
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
          {(() => {
            const openTasks = tasks.filter(
              (t) => t.project_id === project.id && t.status !== "done",
            );
            const doneCount = tasks.filter(
              (t) => t.project_id === project.id && t.status === "done",
            ).length;
            if (openTasks.length === 0 && doneCount === 0) return null;
            return (
              <div className="mt-2">
                {openTasks.length > 0 ? (
                  <ul className="space-y-2">
                    <ReorderableTaskList
                      tasks={openTasks}
                      onReordered={loadAll}
                      domains={domains}
                      projects={projects}
                      onToggleDone={toggleTaskDone}
                      onUpdate={handleTaskUpdate}
                      onDelete={handleTaskDelete}
                      onConvertToRecurring={handleTaskConvertToRecurring}
                      onConvertToKnowledgeItem={handleTaskConvertToKnowledgeItem}
                    />
                  </ul>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No open tasks
                    {doneCount > 0 ? (
                      <>
                        {" — "}
                        <Link href={`/projects/${project.id}`} className="underline">
                          {doneCount} done
                        </Link>
                      </>
                    ) : (
                      ""
                    )}
                    .
                  </p>
                )}
                {openTasks.length > 0 && doneCount > 0 && (
                  <p className="mt-1 text-xs text-zinc-400">
                    <Link href={`/projects/${project.id}`} className="underline">
                      {doneCount} done
                    </Link>
                  </p>
                )}
              </div>
            );
          })()}
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
    {!isSub && children.map((child) => <ProjectCard key={child.id} {...props} project={child} />)}
    </Fragment>
  );
}
