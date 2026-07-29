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
import { todayLocal } from "@/lib/date";
import { projectConversionToast, useToast } from "@/components/toast";
import {
  EMPTY_PROJECT_EXTRAS,
  ProjectPlanningFields,
  ProjectParentStatusFields,
  createFirstTask,
  projectExtrasPayload,
  type ProjectExtrasDraft,
} from "@/components/project-capture-extras";

type TaskCreateFormProps = {
  domains: TaskDomain[];
  projects: TaskProject[];
  domainFilter: string | null;
  projectFilter: string | null;
  setError: (message: string) => void;
  loadRecurringTemplates: () => Promise<void>;
  loadAll: () => Promise<void>;
};

export default function TaskCreateForm({
  domains,
  projects,
  domainFilter,
  projectFilter,
  setError,
  loadRecurringTemplates,
  loadAll,
}: TaskCreateFormProps) {
  const { showToast } = useToast();
  const [captureMode, setCaptureMode] = useState<"task" | "project">("task");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  // Project mode's full shape (#161) — the same shared extras as the
  // Today/Inbox/Domains capture boxes, so a domain page ("Health",
  // "Life OS", …) creates projects exactly like the All Projects page.
  const [projectExtras, setProjectExtras] = useState<ProjectExtrasDraft>(EMPTY_PROJECT_EXTRAS);
  const patchProjectExtras = (patch: Partial<ProjectExtrasDraft>) =>
    setProjectExtras((prev) => ({ ...prev, ...patch }));
  const {
    domainId,
    projectId,
    setDomainId,
    setProjectId,
    filteredProjects,
    reset: resetDomainProject,
  } = useDomainProjectCascade(projects, domainFilter ?? "", projectFilter ?? "");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [waitingFor, setWaitingFor] = useState(false);
  const [waitingOn, setWaitingOn] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [someday, setSomeday] = useState(false);
  const [revisitDate, setRevisitDate] = useState("");
  const [context, setContext] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [energyLevel, setEnergyLevel] = useState<TaskEnergy | "">("");

  const [isRecurring, setIsRecurring] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePatternDraft>(DEFAULT_RECURRENCE_PATTERN);

  // Re-sync the create form's domain/project whenever the URL filter
  // changes — e.g. clicking from one domain's task view to another reuses
  // this same component instance, so the useState initializers above only
  // run once and would otherwise leave the form pointed at the old filter.
  // Adjusting state during render (not in an effect) is React's documented
  // pattern for this: https://react.dev/learn/you-might-not-need-an-effect
  const [prevDomainFilter, setPrevDomainFilter] = useState(domainFilter);
  if (domainFilter !== prevDomainFilter) {
    setPrevDomainFilter(domainFilter);
    setDomainId(domainFilter ?? "");
  }
  const [prevProjectFilter, setPrevProjectFilter] = useState(projectFilter);
  if (projectFilter !== prevProjectFilter) {
    setPrevProjectFilter(projectFilter);
    setProjectId(projectFilter ?? "");
  }

  function resetCreateForm() {
    setTitle("");
    setLink("");
    setNotes("");
    // Reset back to the page's filter, not to blank — when viewing one
    // project's tasks (/tasks?project=X), the next add should still land
    // in that project, same as the form's initial state.
    resetDomainProject(domainFilter ?? "", projectFilter ?? "");
    setPriority("none");
    setDueDate("");
    setScheduledDate("");
    setImage(null);
    setWaitingFor(false);
    setWaitingOn("");
    setFollowUpDate("");
    setSomeday(false);
    setRevisitDate("");
    setContext("");
    setEstimatedMinutes("");
    setEnergyLevel("");
    setProjectExtras(EMPTY_PROJECT_EXTRAS);
    setIsRecurring(false);
    setRecurrencePattern(DEFAULT_RECURRENCE_PATTERN);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);

    // Recurring is a task-mode concept; a leftover checkbox from before a
    // slider flip must never hijack a project submit.
    if (captureMode === "task" && isRecurring) {
      if (recurrencePattern.recurrence_type === "weekly" && recurrencePattern.days_of_week.length === 0) {
        setCreating(false);
        setError("Pick at least one day for a weekly recurring task.");
        return;
      }

      const res = await fetch("/api/recurring-task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          link: link || undefined,
          notes: notes || undefined,
          domain_id: domainId || null,
          project_id: projectId || null,
          priority,
          context: context.trim() || undefined,
          estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
          energy_level: energyLevel || undefined,
          ...recurrencePattern,
        }),
      });

      if (!res.ok) {
        setCreating(false);
        const body = await res.json();
        setError(body.error ?? "Failed to create recurring task");
        return;
      }

      setCreating(false);
      resetCreateForm();
      await loadRecurringTemplates();
      await loadAll();
      return;
    }

    if (captureMode === "project") {
      // Same rule as the other project forms: a top-level project needs a
      // domain to show in the sidebar (subprojects inherit the parent's).
      if (!domainId && !projectExtras.parent_project_id) {
        setCreating(false);
        setError("Pick a domain for the project — it needs one to show in your sidebar.");
        return;
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: title,
          description: notes || undefined,
          link: link || undefined,
          domain_id: domainId || null,
          priority,
          due_date: dueDate || undefined,
          scheduled_date: scheduledDate || undefined,
          ...projectExtrasPayload(projectExtras),
        }),
      });
      setCreating(false);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create project");
        return;
      }
      const project = await res.json();
      await createFirstTask(projectExtras.next_action, project.id, domainId || null);
      // New projects don't appear in this task list — the toast is the
      // receipt, and its action deep-links to the planning form.
      showToast(...projectConversionToast(project, domains));
      resetCreateForm();
      await loadAll();
      return;
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        link: link || undefined,
        notes: notes || undefined,
        domain_id: domainId || null,
        project_id: projectId || null,
        priority,
        due_date: dueDate || undefined,
        scheduled_date: scheduledDate || undefined,
        waiting_for: waitingFor || undefined,
        waiting_on: waitingFor && waitingOn.trim() ? waitingOn.trim() : undefined,
        follow_up_date: waitingFor && followUpDate ? followUpDate : undefined,
        someday: someday || undefined,
        revisit_date: someday && revisitDate ? revisitDate : undefined,
        context: context.trim() || undefined,
        estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        energy_level: energyLevel || undefined,
        client_date: todayLocal(),
      }),
    });

    if (!res.ok) {
      setCreating(false);
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return;
    }

    const task = await res.json();
    markTaskAdded(task.id);

    if (image) {
      const formData = new FormData();
      formData.append("file", image);
      await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body: formData });
    }

    setCreating(false);
    resetCreateForm();
    await loadAll();
  }

  return (
    <form
      onSubmit={handleCreate}
      className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <CaptureModeToggle mode={captureMode} onChange={setCaptureMode} />
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {captureMode === "task" ? "New task" : "New project"}
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={captureMode === "task" ? "e.g. Call the dentist" : "New project name"}
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
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
      {captureMode === "project" && (
        <ProjectPlanningFields
          idPrefix="tasks-proj"
          draft={projectExtras}
          onChange={patchProjectExtras}
        />
      )}
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
            disabled={captureMode === "project" && !!projectExtras.parent_project_id}
            onChange={(e) => setDomainId(e.target.value)}
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
            idPrefix="tasks-proj"
            draft={projectExtras}
            onChange={patchProjectExtras}
            projects={projects}
            onParentPicked={(pickedDomainId) => setDomainId(pickedDomainId ?? "")}
          />
        )}
        {captureMode === "task" && (
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
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
        {!isRecurring && (
          <>
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
                }}
                className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            {captureMode === "task" && (
              <WaitingForFields
                waitingFor={waitingFor}
                onWaitingForChange={setWaitingFor}
                waitingOn={waitingOn}
                onWaitingOnChange={setWaitingOn}
                followUpDate={followUpDate}
                onFollowUpDateChange={setFollowUpDate}
              />
            )}
            {captureMode === "task" && (
              <TaskExtraFields
                someday={someday}
                onSomedayChange={setSomeday}
                revisitDate={revisitDate}
                onRevisitDateChange={setRevisitDate}
                context={context}
                onContextChange={setContext}
                estimatedMinutes={estimatedMinutes}
                onEstimatedMinutesChange={setEstimatedMinutes}
                energyLevel={energyLevel}
                onEnergyLevelChange={setEnergyLevel}
              />
            )}
            {captureMode === "task" && (
              <ImageAttachButton image={image} onChange={setImage} />
            )}
          </>
        )}
        <button
          type="submit"
          disabled={creating}
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {creating ? "Adding..." : "Add"}
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
                context={context}
                onContextChange={setContext}
                estimatedMinutes={estimatedMinutes}
                onEstimatedMinutesChange={setEstimatedMinutes}
                energyLevel={energyLevel}
                onEnergyLevelChange={setEnergyLevel}
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
