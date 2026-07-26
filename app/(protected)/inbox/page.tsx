"use client";

import { useState, type FormEvent } from "react";
import SmartListHeader from "@/components/smart-list-header";
import { type TaskPriority, type TaskEnergy } from "@/components/task-row";
import ReorderableTaskList from "@/components/reorderable-task-list";
import RecurrenceFields, {
  DEFAULT_RECURRENCE_PATTERN,
  type RecurrencePatternDraft,
} from "@/components/recurrence-fields";
import WaitingForFields from "@/components/waiting-for-fields";
import TaskExtraFields from "@/components/task-extra-fields";
import ContextFields from "@/components/context-fields";
import ClarifyFlow from "@/components/clarify-flow";
import MindSweepFlow from "@/components/mind-sweep-flow";
import { useDomainProjectCascade } from "@/lib/hooks/use-domain-project-cascade";
import { useTaskList } from "@/lib/hooks/use-task-list";

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];

export default function InboxPage() {
  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    handleUpdate,
    toggleDone,
    handleDelete,
    createTask,
    handleConvertToProject,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
    loadAll,
  } = useTaskList();

  const [captureMode, setCaptureMode] = useState<"task" | "project">("task");
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
  } = useDomainProjectCascade(projects);
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
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePatternDraft>(DEFAULT_RECURRENCE_PATTERN);

  // waiting_for is excluded: once delegated, an item lives on the Waiting
  // For list — it's been processed, so it no longer belongs in the inbox.
  const inboxTasks = tasks.filter(
    (t) => !t.domain_id && !t.someday && !t.waiting_for && t.status !== "done",
  );

  // Snapshot of ids when Clarify starts, so the flow's order and progress
  // count stay stable while individual actions reshuffle the live list.
  const [clarifyQueue, setClarifyQueue] = useState<string[] | null>(null);
  const [sweeping, setSweeping] = useState(false);

  function resetForm() {
    setTitle("");
    setLink("");
    setNotes("");
    resetDomainProject();
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
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setCreateError(null);

    if (isRecurring) {
      if (recurrencePattern.recurrence_type === "weekly" && recurrencePattern.days_of_week.length === 0) {
        setSubmitting(false);
        setCreateError("Pick at least one day for a weekly recurring task.");
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

      setSubmitting(false);
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? "Failed to create recurring task");
        return;
      }

      resetForm();
      await loadAll();
      return;
    }

    if (captureMode === "project") {
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
        }),
      });
      setSubmitting(false);
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? "Failed to create project");
        return;
      }
      resetForm();
      return;
    }

    const created = await createTask({
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
    });
    if (!created) {
      setSubmitting(false);
      return;
    }

    if (image) {
      const formData = new FormData();
      formData.append("file", image);
      await fetch(`/api/tasks/${created.id}/attachments`, { method: "POST", body: formData });
    }

    setSubmitting(false);
    resetForm();
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📥" color="#3b82f6" title="Inbox" count={inboxTasks.length} />

      {(error || createError) && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error || createError}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setCaptureMode("task")}
            className={`rounded px-2 py-1 font-medium ${
              captureMode === "task"
                ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Task
          </button>
          <button
            type="button"
            onClick={() => setCaptureMode("project")}
            className={`rounded px-2 py-1 font-medium ${
              captureMode === "project"
                ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            Project
          </button>
        </div>
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
            placeholder={captureMode === "task" ? "e.g. Call the dentist" : "Project name"}
            disabled={submitting}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
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
              )}
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
            disabled={submitting || !title.trim()}
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

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : sweeping ? (
        <MindSweepFlow
          onCreateTask={createTask}
          onStartClarify={() => {
            setSweeping(false);
            setClarifyQueue(inboxTasks.map((t) => t.id));
          }}
          onExit={() => setSweeping(false)}
        />
      ) : clarifyQueue ? (
        <ClarifyFlow
          queue={clarifyQueue}
          tasks={tasks}
          domains={domains}
          projects={projects}
          onUpdate={handleUpdate}
          onTrash={(id) => handleDelete(id, undefined, true)}
          onToggleDone={toggleDone}
          onConvertToProject={(id) => handleConvertToProject(id, true)}
          onConvertToReference={(id) => handleConvertToKnowledgeItem(id, true)}
          onCreateTask={createTask}
          onExit={() => setClarifyQueue(null)}
        />
      ) : inboxTasks.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">Nothing unprocessed — inbox is clear.</p>
          <button
            onClick={() => setSweeping(true)}
            title="GTD mind sweep — guided trigger list, rapid capture to the Inbox"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            🧠 Mind Sweep — empty your head
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              💡 GTD&apos;s two-minute rule: if something here takes less than two minutes, just do
              it now instead of filing it.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setSweeping(true)}
                title="GTD mind sweep — guided trigger list, rapid capture to the Inbox"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                🧠 Mind Sweep
              </button>
              <button
                onClick={() => setClarifyQueue(inboxTasks.map((t) => t.id))}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                ⚡ Clarify ({inboxTasks.length})
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            <ReorderableTaskList
              tasks={inboxTasks}
              onReordered={loadAll}
              domains={domains}
              projects={projects}
              onToggleDone={toggleDone}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onConvertToProject={handleConvertToProject}
              onConvertToRecurring={handleConvertToRecurring}
              onConvertToKnowledgeItem={handleConvertToKnowledgeItem}
            />
          </ul>
        </>
      )}
    </div>
  );
}
