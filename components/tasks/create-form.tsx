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
import { useDomainProjectCascade } from "@/lib/hooks/use-domain-project-cascade";
import { PRIORITIES } from "@/lib/tasks/constants";
import { todayLocal } from "@/lib/date";

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
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
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
    setIsRecurring(false);
    setRecurrencePattern(DEFAULT_RECURRENCE_PATTERN);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);

    if (isRecurring) {
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
            <option value="">Inbox</option>
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
            {filteredProjects.map((p) => (
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
            <WaitingForFields
              waitingFor={waitingFor}
              onWaitingForChange={setWaitingFor}
              waitingOn={waitingOn}
              onWaitingOnChange={setWaitingOn}
              followUpDate={followUpDate}
              onFollowUpDateChange={setFollowUpDate}
            />
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
            <label
              aria-label="Add image"
              title={image ? image.name : "Add image"}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
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
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10.5" r="1.5" />
                <path d="M3 16l5-4 4 3 4-3 5 4" />
                <path d="M15 6h4M17 4v4" />
              </svg>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            {image && (
              <button
                type="button"
                onClick={() => setImage(null)}
                title="Remove image"
                className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
              >
                {image.name} ✕
              </button>
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
    </form>
  );
}
