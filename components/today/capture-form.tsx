"use client";

import { useState, type FormEvent } from "react";
import { type TaskDomain, type TaskPriority, type TaskEnergy, type TaskProject } from "@/components/task-row";
import { markTaskAdded } from "@/components/leave-transition";
import RecurrenceFields, {
  DEFAULT_RECURRENCE_PATTERN,
  type RecurrencePatternDraft,
} from "@/components/recurrence-fields";
import WaitingForFields from "@/components/waiting-for-fields";
import TaskExtraFields from "@/components/task-extra-fields";
import ContextFields from "@/components/context-fields";
import CaptureModeToggle from "@/components/capture-mode-toggle";
import ImageAttachButton from "@/components/image-attach-button";
import { useDomainProjectCascade } from "@/lib/hooks/use-domain-project-cascade";
import { PRIORITIES } from "@/lib/tasks/constants";
import { projectConversionToast, useToast } from "@/components/toast";
import {
  EMPTY_PROJECT_EXTRAS,
  ProjectPlanningFields,
  ProjectParentStatusFields,
  createFirstTask,
  projectExtrasPayload,
  type ProjectExtrasDraft,
} from "@/components/project-capture-extras";

type TodayCaptureFormProps = {
  today: string;
  domains: TaskDomain[];
  projects: TaskProject[];
  setError: (message: string | null) => void;
  refreshTasks: () => Promise<void>;
  /** Domains page reuse: preselect this domain (tasks and projects alike). */
  initialDomainId?: string;
  /** Domains page reuse: "" = don't date-claim captured tasks. Defaults to `today`. */
  defaultScheduledDate?: string;
  taskPlaceholder?: string;
};

export default function TodayCaptureForm({
  today,
  domains,
  projects,
  setError,
  refreshTasks,
  initialDomainId,
  defaultScheduledDate,
  taskPlaceholder,
}: TodayCaptureFormProps) {
  const { showToast } = useToast();
  const scheduledDefault = defaultScheduledDate ?? today;

  const [captureMode, setCaptureMode] = useState<"task" | "project">("task");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskLink, setNewTaskLink] = useState("");
  const [newTaskNotes, setNewTaskNotes] = useState("");
  const {
    domainId: newTaskDomainId,
    projectId: newTaskProjectId,
    setDomainId: setNewTaskDomainId,
    setProjectId: setNewTaskProjectId,
    filteredProjects: newTaskFilteredProjects,
    reset: resetNewTaskDomainProject,
  } = useDomainProjectCascade(projects, initialDomainId ?? "");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("none");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskScheduledDate, setNewTaskScheduledDate] = useState(scheduledDefault);
  // Project mode's full shape (#161): the same planning / parent / status
  // inputs as the All Projects form, via the shared extras component.
  const [projectExtras, setProjectExtras] = useState<ProjectExtrasDraft>(EMPTY_PROJECT_EXTRAS);
  const patchProjectExtras = (patch: Partial<ProjectExtrasDraft>) =>
    setProjectExtras((prev) => ({ ...prev, ...patch }));
  const [newTaskImage, setNewTaskImage] = useState<File | null>(null);
  const [newTaskWaitingFor, setNewTaskWaitingFor] = useState(false);
  const [newTaskWaitingOn, setNewTaskWaitingOn] = useState("");
  const [newTaskFollowUpDate, setNewTaskFollowUpDate] = useState("");
  const [newTaskSomeday, setNewTaskSomeday] = useState(false);
  const [newTaskRevisitDate, setNewTaskRevisitDate] = useState("");
  const [newTaskContext, setNewTaskContext] = useState("");
  const [newTaskEstimatedMinutes, setNewTaskEstimatedMinutes] = useState("");
  const [newTaskEnergyLevel, setNewTaskEnergyLevel] = useState<TaskEnergy | "">("");
  const [addingTask, setAddingTask] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePatternDraft>(DEFAULT_RECURRENCE_PATTERN);

  function resetCreateForm() {
    setNewTaskTitle("");
    setNewTaskLink("");
    setNewTaskNotes("");
    resetNewTaskDomainProject(initialDomainId ?? "");
    setNewTaskPriority("none");
    setNewTaskDueDate("");
    setNewTaskScheduledDate(scheduledDefault);
    setProjectExtras(EMPTY_PROJECT_EXTRAS);
    setNewTaskImage(null);
    setNewTaskWaitingFor(false);
    setNewTaskWaitingOn("");
    setNewTaskFollowUpDate("");
    setNewTaskSomeday(false);
    setNewTaskRevisitDate("");
    setNewTaskContext("");
    setNewTaskEstimatedMinutes("");
    setNewTaskEnergyLevel("");
    setIsRecurring(false);
    setRecurrencePattern(DEFAULT_RECURRENCE_PATTERN);
  }

  async function handleCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newTaskTitle.trim() || addingTask) return;
    setAddingTask(true);

    // Recurring is a task-mode concept; a leftover checkbox from before a
    // slider flip must never hijack a project submit.
    if (captureMode === "task" && isRecurring) {
      if (recurrencePattern.recurrence_type === "weekly" && recurrencePattern.days_of_week.length === 0) {
        setAddingTask(false);
        setError("Pick at least one day for a weekly recurring task.");
        return;
      }

      const res = await fetch("/api/recurring-task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle,
          link: newTaskLink || undefined,
          notes: newTaskNotes || undefined,
          domain_id: newTaskDomainId || null,
          project_id: newTaskProjectId || null,
          priority: newTaskPriority,
          context: newTaskContext.trim() || undefined,
          estimated_minutes: newTaskEstimatedMinutes ? Number(newTaskEstimatedMinutes) : undefined,
          energy_level: newTaskEnergyLevel || undefined,
          ...recurrencePattern,
        }),
      });

      setAddingTask(false);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create recurring task");
        return;
      }

      resetCreateForm();
      await refreshTasks();
      return;
    }

    if (captureMode === "project") {
      // Subprojects inherit their parent's domain; only top-level ones
      // need an explicit pick.
      if (!newTaskDomainId && !projectExtras.parent_project_id) {
        setAddingTask(false);
        setError("Pick a domain for the project — it needs one to show in your sidebar.");
        return;
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTaskTitle,
          description: newTaskNotes || undefined,
          link: newTaskLink || undefined,
          domain_id: newTaskDomainId || null,
          priority: newTaskPriority,
          due_date: newTaskDueDate || undefined,
          scheduled_date: newTaskScheduledDate || undefined,
          ...projectExtrasPayload(projectExtras),
        }),
      });
      setAddingTask(false);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create project");
        return;
      }
      const project = await res.json();
      await createFirstTask(projectExtras.next_action, project.id, newTaskDomainId || null);
      // Projects don't show on Today — without this the capture looks like
      // it did nothing.
      showToast(...projectConversionToast(project, domains));
      resetCreateForm();
      await refreshTasks();
      return;
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTaskTitle,
        link: newTaskLink || undefined,
        notes: newTaskNotes || undefined,
        domain_id: newTaskDomainId || null,
        project_id: newTaskProjectId || null,
        priority: newTaskPriority,
        due_date: newTaskDueDate || undefined,
        scheduled_date: newTaskScheduledDate || undefined,
        waiting_for: newTaskWaitingFor || undefined,
        waiting_on: newTaskWaitingFor && newTaskWaitingOn.trim() ? newTaskWaitingOn.trim() : undefined,
        follow_up_date: newTaskWaitingFor && newTaskFollowUpDate ? newTaskFollowUpDate : undefined,
        client_date: today,
        someday: newTaskSomeday || undefined,
        revisit_date: newTaskSomeday && newTaskRevisitDate ? newTaskRevisitDate : undefined,
        context: newTaskContext.trim() || undefined,
        estimated_minutes: newTaskEstimatedMinutes ? Number(newTaskEstimatedMinutes) : undefined,
        energy_level: newTaskEnergyLevel || undefined,
      }),
    });

    if (!res.ok) {
      setAddingTask(false);
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return;
    }

    const created = await res.json();
    markTaskAdded(created.id);

    if (newTaskImage) {
      const formData = new FormData();
      formData.append("file", newTaskImage);
      await fetch(`/api/tasks/${created.id}/attachments`, { method: "POST", body: formData });
    }

    setAddingTask(false);
    resetCreateForm();
    await refreshTasks();
  }

  return (
    <form
      onSubmit={handleCreateSubmit}
      className="mb-4 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <CaptureModeToggle mode={captureMode} onChange={setCaptureMode} />
      <div>
        <label
          htmlFor="today-title"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {captureMode === "task" ? "New task" : "New project"}
        </label>
        <input
          id="today-title"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder={
            captureMode === "task" ? (taskPlaceholder ?? "Add a task for today") : "New project name"
          }
          disabled={addingTask}
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label
          htmlFor="today-link"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Link (optional)
        </label>
        <input
          id="today-link"
          type="url"
          value={newTaskLink}
          onChange={(e) => setNewTaskLink(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label
          htmlFor="today-notes"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Notes (optional)
        </label>
        <textarea
          id="today-notes"
          value={newTaskNotes}
          onChange={(e) => setNewTaskNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      {captureMode === "project" && (
        <ProjectPlanningFields
          idPrefix="today-proj"
          draft={projectExtras}
          onChange={patchProjectExtras}
        />
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="today-domain"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Domain
          </label>
          <select
            id="today-domain"
            value={newTaskDomainId}
            disabled={captureMode === "project" && !!projectExtras.parent_project_id}
            onChange={(e) => setNewTaskDomainId(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">{captureMode === "project" ? "Choose a domain…" : "Inbox"}</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {captureMode === "project" && (
          <ProjectParentStatusFields
            idPrefix="today-proj"
            draft={projectExtras}
            onChange={patchProjectExtras}
            projects={projects}
            onParentPicked={(domainId) => setNewTaskDomainId(domainId ?? "")}
          />
        )}
        {captureMode === "task" && (
          <div>
            <label
              htmlFor="today-project"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Project
            </label>
            <select
              id="today-project"
              value={newTaskProjectId}
              onChange={(e) => setNewTaskProjectId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No project</option>
              {newTaskFilteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label
            htmlFor="today-priority"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Priority
          </label>
          <select
            id="today-priority"
            value={newTaskPriority}
            onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {!isRecurring && (
          <>
            <div>
              <label
                htmlFor="today-due"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Due date
              </label>
              <input
                id="today-due"
                type="date"
                value={newTaskDueDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewTaskDueDate(value);
                }}
                className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label
                htmlFor="today-scheduled"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Scheduled
              </label>
              <input
                id="today-scheduled"
                type="date"
                value={newTaskScheduledDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewTaskScheduledDate(value);
                }}
                className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            {captureMode === "task" && (
              <WaitingForFields
                waitingFor={newTaskWaitingFor}
                onWaitingForChange={setNewTaskWaitingFor}
                waitingOn={newTaskWaitingOn}
                onWaitingOnChange={setNewTaskWaitingOn}
                followUpDate={newTaskFollowUpDate}
                onFollowUpDateChange={setNewTaskFollowUpDate}
              />
            )}
            {captureMode === "task" && (
              <TaskExtraFields
                someday={newTaskSomeday}
                onSomedayChange={setNewTaskSomeday}
                revisitDate={newTaskRevisitDate}
                onRevisitDateChange={setNewTaskRevisitDate}
                context={newTaskContext}
                onContextChange={setNewTaskContext}
                estimatedMinutes={newTaskEstimatedMinutes}
                onEstimatedMinutesChange={setNewTaskEstimatedMinutes}
                energyLevel={newTaskEnergyLevel}
                onEnergyLevelChange={setNewTaskEnergyLevel}
              />
            )}
            {captureMode === "task" && (
              <ImageAttachButton image={newTaskImage} onChange={setNewTaskImage} />
            )}
          </>
        )}
        <button
          type="submit"
          disabled={addingTask || !newTaskTitle.trim()}
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </div>
      {captureMode === "task" && (
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            Make this recurring
          </label>
          {isRecurring && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ContextFields
                  context={newTaskContext}
                  onContextChange={setNewTaskContext}
                  estimatedMinutes={newTaskEstimatedMinutes}
                  onEstimatedMinutesChange={setNewTaskEstimatedMinutes}
                  energyLevel={newTaskEnergyLevel}
                  onEnergyLevelChange={setNewTaskEnergyLevel}
                />
              </div>
              <RecurrenceFields
                pattern={recurrencePattern}
                onChange={(updates) => setRecurrencePattern((prev) => ({ ...prev, ...updates }))}
              />
            </>
          )}
        </div>
      )}
    </form>
  );
}
