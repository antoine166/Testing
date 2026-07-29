"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { findStalledProjectIds } from "@/lib/projects/stalled";
import { useConfirmDialog } from "@/components/confirm-dialog";
import ProjectCard from "@/components/project-card";
import ProjectCreateForm from "@/components/project-create-form";
import {
  type Project,
  type ProjectPriority,
  type ProjectStatus,
  type ProjectTemplate,
  type SupportItem,
} from "@/lib/projects/types";

const NO_DOMAIN_KEY = "__none__";

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const domainFilter = searchParams.get("domain");
  const { confirm, prompt } = useConfirmDialog();

  // Shared fetch + task-CRUD wiring (July 2026 de-dup, issue #112): the
  // task rows under each project get the same optimistic, offline-safe,
  // undo-toasted handlers as every other task list, instead of the page's
  // former hand-rolled copies.
  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    setError,
    handleUpdate: handleTaskUpdate,
    toggleDone: toggleTaskDone,
    handleDelete: handleTaskDelete,
    handleConvertToRecurring: handleTaskConvertToRecurring,
    handleConvertToKnowledgeItem: handleTaskConvertToKnowledgeItem,
    createTask,
    loadAll,
  } = useTaskList<Project>({ onAfterRefresh: () => loadExtras() });

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

  const [newTaskTitles, setNewTaskTitles] = useState<Record<string, string>>({});
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [supportItems, setSupportItems] = useState<SupportItem[]>([]);
  // #125: which project card is currently playing its completion
  // celebration — a multi-week effort deserves more than a status dropdown.
  const [celebratingId, setCelebratingId] = useState<string | null>(null);

  // Templates + reference items are page-specific extras the shared hook
  // doesn't fetch. onAfterRefresh keeps them in step with the hook's
  // reloads; the effect covers first paint (the hook's initial load
  // doesn't run onAfterRefresh); the realtime subscription covers edits
  // to just these tables from another tab. Same pattern as the Tasks
  // page's recurring-template list.
  async function loadExtras() {
    const [templatesRes, itemsRes] = await Promise.all([
      fetch("/api/project-templates"),
      fetch("/api/knowledge-items"),
    ]);
    if (!templatesRes.ok || !itemsRes.ok) return;
    setTemplates(await templatesRes.json());
    setSupportItems(await itemsRes.json());
  }

  useEffect(() => {
    loadExtras();
  }, []);

  useRealtimeRefresh(["project_templates", "knowledge_items"], () => loadExtras());

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
    setEditReviewEveryDays(project.review_every_days ? String(project.review_every_days) : "");
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

  async function handleAddTask(project: Project, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = (newTaskTitles[project.id] ?? "").trim();
    if (!title) return;

    setAddingTaskId(project.id);
    // createTask (shared hook) prepends the new row locally instead of a
    // full reload — same optimistic behavior as every other task list.
    const created = await createTask({
      title,
      project_id: project.id,
      domain_id: project.domain_id,
    });
    setAddingTaskId(null);
    if (!created) return;

    setNewTaskTitles((prev) => ({ ...prev, [project.id]: "" }));
  }

  async function handleCompleteProject(project: Project) {
    const openCount = tasks.filter(
      (t) => t.project_id === project.id && t.status !== "done",
    ).length;
    if (
      !(await confirm({
        message: `Complete “${project.name}”?${
          openCount > 0
            ? ` Its ${openCount} open task${openCount === 1 ? "" : "s"} will stay with the completed project.`
            : ""
        }`,
        confirmLabel: "Complete project",
      }))
    )
      return;

    // Celebration first, save behind it — finishing a project should feel
    // like a milestone (#125: ~3× the task/habit effect), not a dropdown.
    setCelebratingId(project.id);
    setTimeout(() => setCelebratingId(null), 1800);

    const res = await fetch(`/api/projects/${project.id}`, {
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

  async function handleSaveAsTemplate(project: Project) {
    const name = await prompt({ message: "Template name:", defaultValue: project.name });
    if (name === null) return;
    const res = await fetch("/api/project-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_project_id: project.id, name }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save template");
      return;
    }
    await loadAll();
  }

  async function handleUseTemplate(template: ProjectTemplate) {
    const name = await prompt({ message: "Name for the new project:", defaultValue: template.name });
    if (name === null) return;
    const res = await fetch(`/api/project-templates/${template.id}/instantiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create project from template");
      return;
    }
    await loadAll();
  }

  async function handleRenameTemplate(template: ProjectTemplate) {
    const name = await prompt({ message: "Rename template:", defaultValue: template.name });
    if (name === null || !name.trim() || name.trim() === template.name) return;
    const res = await fetch(`/api/project-templates/${template.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to rename template");
      return;
    }
    await loadAll();
  }

  async function handleDeleteTemplate(template: ProjectTemplate) {
    // Hard delete (not trash-backed) — same as recurring task templates, so
    // the confirm carries the weight.
    if (
      !(await confirm({
        message: `Delete the template "${template.name}"? This can't be undone. Projects already created from it are unaffected.`,
        confirmLabel: "Delete",
        danger: true,
      }))
    ) {
      return;
    }
    const res = await fetch(`/api/project-templates/${template.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete template");
      return;
    }
    await loadAll();
  }

  async function handleDelete(id: string) {
    const hasSubprojects = projects.some((p) => p.parent_project_id === id);
    const message = hasSubprojects
      ? "Move this project to trash? Its subprojects and all their tasks move with it, and you can restore them together within 30 days."
      : "Move this project to trash? Its tasks move with it, and you can restore them together within 30 days.";
    if (!(await confirm({ message, confirmLabel: "Move to Trash", danger: true }))) {
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

  // Completed projects leave the browsing pages — they live in the Logbook,
  // and their reference material stays grouped in the Library. The full
  // `projects` list still feeds edit forms and parent pickers unchanged.
  const browsableProjects = projects.filter((p) => p.status !== "completed");

  const childrenByParent = new Map<string, Project[]>();
  for (const project of browsableProjects) {
    if (!project.parent_project_id) continue;
    if (!childrenByParent.has(project.parent_project_id)) {
      childrenByParent.set(project.parent_project_id, []);
    }
    childrenByParent.get(project.parent_project_id)!.push(project);
  }

  const stalledProjectIds = findStalledProjectIds(projects, tasks);
  function isStalled(project: Project) {
    return stalledProjectIds.has(project.id);
  }

  const topLevelProjects = projects.filter((p) => !p.parent_project_id);
  const parentOptions = (excludeId?: string) =>
    topLevelProjects.filter((p) => p.id !== excludeId);

  const domainsById = new Map(domains.map((d) => [d.id, d]));
  const grouped = new Map<string, Project[]>();
  for (const project of browsableProjects.filter((p) => !p.parent_project_id)) {
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

      <ProjectCreateForm
        domains={domains}
        projects={projects}
        parentOptions={parentOptions}
        domainFilter={domainFilter}
        setError={setError}
        loadAll={loadAll}
      />

      {templates.length > 0 && (
        <details className="mb-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Project templates ({templates.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{template.name}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {template.project_template_tasks.length} task
                    {template.project_template_tasks.length === 1 ? "" : "s"}
                    {template.domain_id
                      ? ` · ${domains.find((d) => d.id === template.domain_id)?.name ?? ""}`
                      : ""}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => handleRenameTemplate(template)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No projects yet. Add your first one above.
        </p>
      ) : groupKeys.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No active projects — completed projects live in the Logbook.
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
                    <ProjectCard
                      key={project.id}
                      project={project}
                      childrenByParent={childrenByParent}
                      celebratingId={celebratingId}
                      editingId={editingId}
                      setEditingId={setEditingId}
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
                      projects={projects}
                      handleUpdate={handleUpdate}
                      startEdit={startEdit}
                      handleDelete={handleDelete}
                      handleCompleteProject={handleCompleteProject}
                      handleSaveAsTemplate={handleSaveAsTemplate}
                      isStalled={isStalled}
                      supportItems={supportItems}
                      tasks={tasks}
                      loadAll={loadAll}
                      toggleTaskDone={toggleTaskDone}
                      handleTaskUpdate={handleTaskUpdate}
                      handleTaskDelete={handleTaskDelete}
                      handleTaskConvertToRecurring={handleTaskConvertToRecurring}
                      handleTaskConvertToKnowledgeItem={handleTaskConvertToKnowledgeItem}
                      newTaskTitles={newTaskTitles}
                      setNewTaskTitles={setNewTaskTitles}
                      addingTaskId={addingTaskId}
                      handleAddTask={handleAddTask}
                    />
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
