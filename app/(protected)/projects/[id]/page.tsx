"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { usePageData } from "@/lib/hooks/use-page-data";
import { useListOrder } from "@/lib/hooks/use-list-order";
import { applyListOrder } from "@/lib/tasks/list-order";
import { useConfirmDialog } from "@/components/confirm-dialog";
import ReorderableTaskList from "@/components/reorderable-task-list";
import TaskRow from "@/components/task-row";
import ProjectEditForm from "@/components/project-edit-form";
import ProjectDetailHeader from "@/components/project-detail-header";
import ProjectCelebration, { PROJECT_CELEBRATE_MS } from "@/components/project-celebration";
import {
  type Project,
  type ProjectPriority,
  type ProjectStatus,
  type SupportItem,
} from "@/lib/projects/types";

/**
 * The project detail page (#139 + #132): one place holding everything a
 * project accumulates — planning fields, open tasks, completed history,
 * and reference material. The Projects page card links here for the
 * pieces that don't belong on a browsing list. The header toolbar offers
 * the same actions as the All-Projects card (template / plan / complete /
 * edit / delete), so nothing requires a round trip back to the list.
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  // ?edit=1 (from other surfaces' Edit buttons) opens the inline form on
  // arrival — one-shot, render-adjust like the repo's other URL seeds.
  const wantsEdit = useSearchParams().get("edit") === "1";
  const [autoEditDone, setAutoEditDone] = useState(false);
  const router = useRouter();
  const { confirm, prompt } = useConfirmDialog();

  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    setError,
    handleUpdate,
    toggleDone,
    handleDelete,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
    createTask,
    loadAll,
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

  // Header-toolbar state, mirroring the Projects page (#147 follow-up):
  // the same edit-field states drive the shared ProjectEditForm, and
  // celebrating gates the completion overlay over the header card.
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
  const [editReviewEveryDays, setEditReviewEveryDays] = useState("");
  const [celebratingId, setCelebratingId] = useState<string | null>(null);

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

  // Completed projects can't take new subprojects, so they leave the
  // parent picker too (same rule as the task pickers).
  const parentOptions = (excludeId?: string) =>
    projects.filter(
      (p) => !p.parent_project_id && p.id !== excludeId && p.status !== "completed",
    );

  if (wantsEdit && !autoEditDone && project) {
    setAutoEditDone(true);
    startEdit(project);
  }

  function selectEditParentProject(parentId: string) {
    setEditParentProjectId(parentId);
    if (parentId) {
      const parent = projects.find((p) => p.id === parentId);
      setEditDomainId(parent?.domain_id ?? "");
    }
  }

  function startEdit(p: Project) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDescription(p.description ?? "");
    setEditPurpose(p.purpose ?? "");
    setEditOutcomeVision(p.outcome_vision ?? "");
    setEditBrainstorm(p.brainstorm ?? "");
    setEditDomainId(p.domain_id ?? "");
    setEditParentProjectId(p.parent_project_id ?? "");
    setEditStatus(p.status);
    setEditPriority(p.priority);
    setEditDueDate(p.due_date ?? "");
    setEditScheduledDate(p.scheduled_date ?? "");
    setEditLink(p.link ?? "");
    setEditReviewEveryDays(p.review_every_days ? String(p.review_every_days) : "");
  }

  async function handleUpdateProject(projectId: string) {
    if (!editName.trim()) return;

    const res = await fetch(`/api/projects/${projectId}`, {
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
        review_every_days: editReviewEveryDays ? Number(editReviewEveryDays) : null,
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

  async function handleCompleteProject(p: Project) {
    const openCount = tasks.filter(
      (t) => t.project_id === p.id && t.status !== "done",
    ).length;
    if (
      !(await confirm({
        message: `Complete “${p.name}”?${
          openCount > 0
            ? ` Its ${openCount} open task${openCount === 1 ? "" : "s"} will be completed with it.`
            : ""
        }`,
        confirmLabel: "Complete project",
      }))
    )
      return;

    // Celebration first, save behind it — finishing a project should feel
    // like a milestone (#125), same as on the Projects page.
    setCelebratingId(p.id);
    setTimeout(() => setCelebratingId(null), PROJECT_CELEBRATE_MS);

    const res = await fetch(`/api/projects/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    if (!res.ok) {
      setCelebratingId(null);
      const body = await res.json();
      setError(body.error ?? "Failed to complete project");
      return;
    }
    await loadAll();
  }

  async function handleSaveAsTemplate(p: Project) {
    const name = await prompt({ message: "Template name:", defaultValue: p.name });
    if (name === null) return;
    const res = await fetch("/api/project-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_project_id: p.id, name }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save template");
      return;
    }
    await loadAll();
  }

  async function handleDeleteProject(projectId: string) {
    const hasSubprojects = projects.some((p) => p.parent_project_id === projectId);
    const message = hasSubprojects
      ? "Move this project to trash? Its subprojects and all their tasks move with it, and you can restore them together within 30 days."
      : "Move this project to trash? Its tasks move with it, and you can restore them together within 30 days.";
    if (!(await confirm({ message, confirmLabel: "Move to Trash", danger: true }))) {
      return;
    }

    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete project");
      return;
    }

    router.push("/projects");
  }

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

      <div
        className={`relative mt-3 mb-6 ${
          celebratingId === project.id ? "project-celebrate-card" : ""
        }`}
      >
        {celebratingId === project.id && <ProjectCelebration />}
        {editingId === project.id ? (
          <ProjectEditForm
            project={project}
            canBecomeSubproject={subprojects.length === 0}
            editName={editName}
            setEditName={setEditName}
            editDescription={editDescription}
            setEditDescription={setEditDescription}
            editPurpose={editPurpose}
            setEditPurpose={setEditPurpose}
            editOutcomeVision={editOutcomeVision}
            setEditOutcomeVision={setEditOutcomeVision}
            editBrainstorm={editBrainstorm}
            setEditBrainstorm={setEditBrainstorm}
            editDomainId={editDomainId}
            setEditDomainId={setEditDomainId}
            editParentProjectId={editParentProjectId}
            selectEditParentProject={selectEditParentProject}
            editStatus={editStatus}
            setEditStatus={setEditStatus}
            editPriority={editPriority}
            setEditPriority={setEditPriority}
            editDueDate={editDueDate}
            setEditDueDate={setEditDueDate}
            editScheduledDate={editScheduledDate}
            setEditScheduledDate={setEditScheduledDate}
            editLink={editLink}
            setEditLink={setEditLink}
            editReviewEveryDays={editReviewEveryDays}
            setEditReviewEveryDays={setEditReviewEveryDays}
            parentOptions={parentOptions}
            domains={domains}
            handleUpdate={handleUpdateProject}
            setEditingId={setEditingId}
          />
        ) : (
          <ProjectDetailHeader
            project={project}
            domain={domain}
            parentProject={parentProject}
            onSaveAsTemplate={handleSaveAsTemplate}
            onCompleteProject={handleCompleteProject}
            onStartEdit={startEdit}
            onDeleteProject={handleDeleteProject}
          />
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
