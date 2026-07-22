"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { describeRecurrence, type RecurrencePattern } from "@/lib/recurring-tasks/types";
import { todayLocal } from "@/lib/date";
import RecurrenceFields, {
  DEFAULT_RECURRENCE_PATTERN,
  type RecurrencePatternDraft,
} from "@/components/recurrence-fields";
import { useDomainProjectCascade } from "@/lib/hooks/use-domain-project-cascade";
import WaitingForFields from "@/components/waiting-for-fields";
import TaskExtraFields from "@/components/task-extra-fields";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "none" | "low" | "medium" | "high";
export type TaskEnergy = "low" | "medium" | "high";

export type Task = {
  id: string;
  project_id: string | null;
  domain_id: string | null;
  title: string;
  link: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  scheduled_date: string | null;
  /** Only meaningful alongside scheduled_date — a real appointment (GTD's hard landscape), not just a day it's planned for. */
  scheduled_time?: string | null;
  someday: boolean;
  context: string | null;
  waiting_for: boolean;
  waiting_since: string | null;
  follow_up_date?: string | null;
  waiting_on?: string | null;
  completed_at?: string | null;
  recurring_template_id?: string | null;
  recurring_task_templates?: RecurrencePattern | null;
  estimated_minutes?: number | null;
  energy_level?: TaskEnergy | null;
  revisit_date?: string | null;
};

export type TaskDomain = { id: string; name: string; color: string };
export type TaskProject = { id: string; name: string; domain_id: string | null };

type Attachment = {
  id: string;
  filename: string;
  content_type: string | null;
  url: string | null;
};

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

const NOTES_PREVIEW_LENGTH = 200;

function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function daysSince(date: string): number {
  const ms = Date.now() - new Date(`${date}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** "14:30:00" (Postgres time) -> "2:30 PM". */
function formatTime(time: string): string {
  const [hoursStr, minutes] = time.split(":");
  const hours = Number(hoursStr);
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${minutes} ${period}`;
}

function NotesText({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = notes.length > NOTES_PREVIEW_LENGTH;

  return (
    <p className="mt-0.5 text-sm text-zinc-500">
      {expanded || !isLong ? notes : `${notes.slice(0, NOTES_PREVIEW_LENGTH)}…`}
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </p>
  );
}

export type AttachmentStripHandle = { openPicker: () => void };

const AttachmentStrip = forwardRef<
  AttachmentStripHandle,
  { taskId: string; hideAddButton?: boolean }
>(function AttachmentStrip({ taskId, hideAddButton = false }, ref) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    openPicker: () => inputRef.current?.click(),
  }));

  async function loadAttachments() {
    const res = await fetch(`/api/tasks/${taskId}/attachments`);
    if (res.ok) setAttachments(await res.json());
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tasks/${taskId}/attachments`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: Attachment[]) => setAttachments(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [taskId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: formData });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to upload image");
      return;
    }
    await loadAttachments();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/task-attachments/${id}`, { method: "DELETE" });
    await loadAttachments();
  }

  const showStrip = !hideAddButton || (!loading && attachments.length > 0);

  return (
    <>
      {showStrip && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!loading &&
            attachments.map((a) => (
              <div key={a.id} className="group relative h-14 w-14 shrink-0">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={a.url}
                      alt={a.filename}
                      className="h-14 w-14 rounded-md object-cover"
                    />
                  </a>
                ) : (
                  <div className="h-14 w-14 rounded-md bg-zinc-100 dark:bg-zinc-900" />
                )}
                <button
                  onClick={() => handleDelete(a.id)}
                  aria-label={`Remove ${a.filename}`}
                  title={`Remove ${a.filename}`}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-xs text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:bg-zinc-50 dark:text-zinc-950"
                >
                  ×
                </button>
              </div>
            ))}
          {!hideAddButton && (
            <label
              aria-label="Add image"
              title="Add image"
              className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
            >
              {uploading ? (
                <span className="text-xs">...</span>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
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
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}
      {hideAddButton && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </>
  );
});

export default function TaskRow({
  task,
  domains,
  projects,
  onToggleDone,
  onUpdate,
  onDelete,
  onConvertToProject,
  onConvertToRecurring,
  onConvertToKnowledgeItem,
  selectable = false,
  selected = false,
  onSelectChange,
}: {
  task: Task;
  domains: TaskDomain[];
  projects: TaskProject[];
  onToggleDone: (task: Task) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string, scope?: "skip" | "following") => void;
  onConvertToProject?: (id: string) => void;
  /** Seeds a new recurring template from this plain task, then trashes it — the "Repeat..." action Things 3 exposes on any to-do. Omitted (or the task is already part of a series) hides the action. */
  onConvertToRecurring?: (id: string, pattern: RecurrencePatternDraft) => void;
  /** Not actionable — files this task as a Knowledge Library reference item in one motion, then trashes it. GTD's first Clarify fork ("is it actionable?"), the "no" branch. */
  onConvertToKnowledgeItem?: (id: string) => void;
  /** Shows a selection checkbox for bulk actions (e.g. filing multiple Inbox tasks at once). */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePatternDraft>(DEFAULT_RECURRENCE_PATTERN);
  const attachmentRef = useRef<AttachmentStripHandle>(null);

  // Completion animation: checkmark + strikethrough play immediately, then
  // a brief fade before the real update actually fires — so marking a task
  // done feels satisfying instead of the row just vanishing on reload.
  // Un-completing (in views where done tasks are still shown) stays instant.
  const [completing, setCompleting] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the click-time "commit the completion" closure while the animation
  // plays, so an early unmount (fast navigation away) can still fire the save
  // instead of silently dropping it.
  const pendingCommitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
      pendingCommitRef.current?.();
    };
  }, []);

  // Views that filter out done tasks unmount this row once the server
  // confirms completion, so the fade-out is the last thing seen. Views that
  // keep showing done tasks (Logbook, the full Tasks browse) don't unmount
  // it — without this, it'd stay invisible forever instead of settling
  // into its normal "done" look once the fade has had a moment to play.
  useEffect(() => {
    if (task.status === "done" && (completing || fadingOut)) {
      const timeout = setTimeout(() => {
        setCompleting(false);
        setFadingOut(false);
      }, 700);
      return () => clearTimeout(timeout);
    }
  }, [task.status, completing, fadingOut]);

  function handleToggleClick() {
    if (task.status === "done") {
      onToggleDone(task);
      return;
    }
    if (completing) return;
    setCompleting(true);

    // Play the animation *before* saving. Views that hide done tasks refetch
    // and unmount this row the instant the update lands, so firing the save
    // on click (as this used to) removed the row before the strikethrough
    // and fade ever showed. Sequence instead: checkmark pop + strikethrough
    // (~0–300ms) → fade + shrink (450ms) → commit the save (1150ms), by which
    // point the row is already invisible when the parent drops it.
    const commit = () => {
      if (pendingCommitRef.current !== commit) return; // already committed
      pendingCommitRef.current = null;
      onToggleDone(task);
    };
    pendingCommitRef.current = commit; // so an early unmount still saves it
    fadeTimeoutRef.current = setTimeout(() => setFadingOut(true), 450);
    completeTimeoutRef.current = setTimeout(commit, 1150);
  }
  const [title, setTitle] = useState(task.title);
  const [link, setLink] = useState(task.link ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const {
    domainId,
    projectId,
    setDomainId,
    setProjectId,
    filteredProjects,
    reset: resetDomainProject,
  } = useDomainProjectCascade(projects, task.domain_id ?? "", task.project_id ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [scheduledDate, setScheduledDate] = useState(task.scheduled_date ?? "");
  const [scheduledTime, setScheduledTime] = useState(task.scheduled_time ?? "");
  const [someday, setSomeday] = useState(task.someday);
  const [waitingFor, setWaitingFor] = useState(task.waiting_for);
  const [followUpDate, setFollowUpDate] = useState(task.follow_up_date ?? "");
  const [waitingOn, setWaitingOn] = useState(task.waiting_on ?? "");
  const [context, setContext] = useState(task.context ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimated_minutes?.toString() ?? "");
  const [energyLevel, setEnergyLevel] = useState<TaskEnergy | "">(task.energy_level ?? "");
  const [revisitDate, setRevisitDate] = useState(task.revisit_date ?? "");

  function startEdit() {
    setTitle(task.title);
    setLink(task.link ?? "");
    setNotes(task.notes ?? "");
    resetDomainProject(task.domain_id ?? "", task.project_id ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(task.due_date ?? "");
    setScheduledDate(task.scheduled_date ?? "");
    setScheduledTime(task.scheduled_time ?? "");
    setSomeday(task.someday);
    setWaitingFor(task.waiting_for);
    setFollowUpDate(task.follow_up_date ?? "");
    setWaitingOn(task.waiting_on ?? "");
    setContext(task.context ?? "");
    setEstimatedMinutes(task.estimated_minutes?.toString() ?? "");
    setEnergyLevel(task.energy_level ?? "");
    setRevisitDate(task.revisit_date ?? "");
    setShowRecurrencePicker(false);
    setRecurrencePattern(DEFAULT_RECURRENCE_PATTERN);
    setEditing(true);
  }

  function handleSave() {
    if (!title.trim()) return;
    onUpdate(task.id, {
      title,
      link: link.trim() || null,
      notes,
      waiting_for: waitingFor,
      follow_up_date: waitingFor && followUpDate ? followUpDate : null,
      waiting_on: waitingFor && waitingOn.trim() ? waitingOn.trim() : null,
      context: context.trim() || null,
      domain_id: domainId || null,
      project_id: projectId || null,
      status,
      priority,
      due_date: dueDate || null,
      scheduled_date: scheduledDate || null,
      scheduled_time: scheduledDate && scheduledTime ? scheduledTime : null,
      someday,
      revisit_date: someday && revisitDate ? revisitDate : null,
      estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      energy_level: energyLevel || null,
    });
    setEditing(false);
  }

  const project = task.project_id
    ? projects.find((p) => p.id === task.project_id)
    : null;
  const domain = task.domain_id ? domains.find((d) => d.id === task.domain_id) : null;

  if (editing) {
    return (
      <li className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <div className="flex shrink-0 gap-3 pt-1">
              <button
                onClick={handleSave}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
            </div>
          </div>
          {task.recurring_template_id && (
            <Link
              href={`/tasks?editTemplate=${task.recurring_template_id}`}
              className="block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              ↻ Edit the recurring pattern for this series →
            </Link>
          )}
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link (optional)"
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No domain</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No project</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label className="text-xs text-zinc-500">
              Due
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                }}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Scheduled
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setScheduledDate(value);
                  if (!value) setScheduledTime("");
                }}
                title="When you plan to work on it — not a commitment. Only set this if you actually intend to get to it that day; otherwise leave it and pull the task from Anytime when you're ready."
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            {scheduledDate && (
              <label className="text-xs text-zinc-500">
                Time
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  title="Only set a time if this is a real appointment that must happen then — GTD's Calendar, not a to-do list with dates."
                  className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            )}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
          <AttachmentStrip taskId={task.id} />
          {onConvertToProject && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onConvertToProject(task.id);
              }}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Convert to project →
            </button>
          )}
          {onConvertToRecurring && !task.recurring_template_id && (
            <div>
              <button
                type="button"
                onClick={() => setShowRecurrencePicker((v) => !v)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                ↻ Make recurring →
              </button>
              {showRecurrencePicker && (
                <div className="mt-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <RecurrenceFields
                    pattern={recurrencePattern}
                    onChange={(updates) => setRecurrencePattern((prev) => ({ ...prev, ...updates }))}
                  />
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setShowRecurrencePicker(false);
                        onConvertToRecurring(task.id, recurrencePattern);
                      }}
                      className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      Make recurring
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRecurrencePicker(false)}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {onConvertToKnowledgeItem && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onConvertToKnowledgeItem(task.id);
              }}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              File as reference →
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-start justify-between gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 transition-all duration-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
        fadingOut ? "scale-95 opacity-0" : "scale-100 opacity-100"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectChange?.(e.target.checked)}
            aria-label={`Select "${task.title}"`}
            title={`Select "${task.title}"`}
            className="mt-1"
          />
        )}
        <button
          type="button"
          onClick={handleToggleClick}
          disabled={completing}
          aria-pressed={task.status === "done" || completing}
          aria-label={task.status === "done" ? "Mark not done" : "Mark done"}
          title={task.status === "done" ? "Mark not done" : "Mark done"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
            task.status === "done" || completing
              ? "border-blue-500 bg-blue-500 text-white"
              : "border-zinc-300 hover:border-blue-400 dark:border-zinc-600"
          }`}
        >
          {(task.status === "done" || completing) && (
            <svg
              viewBox="0 0 12 12"
              className={`h-3 w-3 ${completing ? "animate-[task-check-pop_300ms_ease-out]" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 6l3 3 5-6" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`relative break-words text-sm font-medium text-zinc-900 dark:text-zinc-100 ${
              completing ? "" : task.status === "done" ? "line-through opacity-60" : ""
            }`}
          >
            {task.title}
            {completing && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-px w-full origin-left scale-x-0 animate-[task-strike_250ms_ease-out_forwards] bg-zinc-900 dark:bg-zinc-100"
              />
            )}
          </p>
          {task.link && (
            <a
              href={task.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              {linkLabel(task.link)}
            </a>
          )}
          {task.notes && <NotesText notes={task.notes} />}
          <p className="mt-1 text-xs text-zinc-500">
            {task.recurring_template_id
              ? `↻ ${task.recurring_task_templates ? describeRecurrence(task.recurring_task_templates) : "recurring"} · `
              : ""}
            {task.status} · {task.priority} priority
            {task.context ? ` · @${task.context}` : ""}
            {domain ? ` · ${domain.name}` : ""}
            {project ? ` · ${project.name}` : ""}
            {task.due_date ? ` · due ${task.due_date}` : ""}
            {task.scheduled_date
              ? task.scheduled_time
                ? ` · 📅 ${task.scheduled_date} at ${formatTime(task.scheduled_time)}`
                : ` · scheduled ${task.scheduled_date}`
              : ""}
            {task.someday ? " · someday" : ""}
            {task.someday && task.revisit_date ? ` · 🔔 revisit ${task.revisit_date}` : ""}
            {task.estimated_minutes ? ` · ~${task.estimated_minutes}min` : ""}
            {task.energy_level ? ` · ${task.energy_level} energy` : ""}
          </p>
          {task.waiting_for && (
            <p
              className={`mt-0.5 text-xs font-medium ${
                (task.follow_up_date && task.follow_up_date <= todayLocal()) ||
                (task.waiting_since && daysSince(task.waiting_since) >= 7)
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-500"
              }`}
            >
              {task.waiting_on ? `⏳ Waiting on ${task.waiting_on}` : "⏳ Waiting For"}
              {task.waiting_since ? ` · ${daysSince(task.waiting_since)}d` : ""}
              {task.follow_up_date
                ? task.follow_up_date <= todayLocal()
                  ? " · 🔔 follow up now"
                  : ` · follow up ${task.follow_up_date}`
                : ""}
            </p>
          )}
          <AttachmentStrip ref={attachmentRef} taskId={task.id} hideAddButton />
        </div>
      </div>
      {confirmingDelete ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-xs text-zinc-500">Skip just this one, or stop the whole series?</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(task.id, "skip");
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              Skip this one
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(task.id, "following");
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              This + future
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => attachmentRef.current?.openPicker()}
            aria-label="Add image"
            title="Add image"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 sm:h-7 sm:w-7 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
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
          </button>
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit task"
            title="Edit task"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 sm:h-7 sm:w-7 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
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
            type="button"
            onClick={() => (task.recurring_template_id ? setConfirmingDelete(true) : onDelete(task.id))}
            aria-label="Delete task"
            title="Delete task"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 sm:h-7 sm:w-7 dark:hover:bg-red-950 dark:hover:text-red-400"
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
      )}
    </li>
  );
}
