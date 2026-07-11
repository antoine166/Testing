"use client";

import { useEffect, useState } from "react";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "none" | "low" | "medium" | "high";

export type Task = {
  id: string;
  project_id: string | null;
  domain_id: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  scheduled_date: string | null;
  source_html?: string | null;
};

export type TaskDomain = { id: string; name: string; color: string };
export type TaskProject = { id: string; name: string };

type Attachment = {
  id: string;
  filename: string;
  content_type: string | null;
  url: string | null;
};

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];
const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

// `html` is sanitized server-side before storage (see lib/email-html.ts) —
// this renders that pre-sanitized string, never raw HTML from the email.
function OriginalEmail({ html }: { html: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
      >
        {open ? "Hide original email" : "View original email"}
      </button>
      {open && (
        <div
          className="email-html mt-2 max-h-96 overflow-y-auto rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function AttachmentStrip({ taskId }: { taskId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: formData });
    setUploading(false);
    await loadAttachments();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/task-attachments/${id}`, { method: "DELETE" });
    await loadAttachments();
  }

  if (loading) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {attachments.map((a) => (
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
            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-xs text-white group-hover:flex dark:bg-zinc-50 dark:text-zinc-950"
          >
            ×
          </button>
        </div>
      ))}
      <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-zinc-400 dark:border-zinc-700">
        {uploading ? "..." : "+ image"}
        <input
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>
    </div>
  );
}

export default function TaskRow({
  task,
  domains,
  projects,
  onToggleDone,
  onUpdate,
  onDelete,
  selectable = false,
  selected = false,
  onSelectChange,
}: {
  task: Task;
  domains: TaskDomain[];
  projects: TaskProject[];
  onToggleDone: (task: Task) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  /** Shows a selection checkbox for bulk actions (e.g. filing multiple Inbox tasks at once). */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [domainId, setDomainId] = useState(task.domain_id ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [scheduledDate, setScheduledDate] = useState(task.scheduled_date ?? "");

  function startEdit() {
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDomainId(task.domain_id ?? "");
    setProjectId(task.project_id ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(task.due_date ?? "");
    setScheduledDate(task.scheduled_date ?? "");
    setEditing(true);
  }

  function handleSave() {
    if (!title.trim()) return;
    onUpdate(task.id, {
      title,
      notes,
      domain_id: domainId || null,
      project_id: projectId || null,
      status,
      priority,
      due_date: dueDate || null,
      scheduled_date: scheduledDate || null,
    });
    setEditing(false);
  }

  const project = task.project_id
    ? projects.find((p) => p.id === task.project_id)
    : null;
  const domain = task.domain_id ? domains.find((d) => d.id === task.domain_id) : null;

  // Email-captured tasks carry the whole plain-text email in `notes`, which
  // reads as a wall of text inline — keep the row preview short and let
  // "View original email" (rendered from source_html) show the rest.
  const notesPreview =
    task.notes && task.source_html && task.notes.length > 200
      ? `${task.notes.slice(0, 200)}…`
      : task.notes;

  if (editing) {
    return (
      <li className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
                onChange={(e) => setDueDate(e.target.value)}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Scheduled
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
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
          <AttachmentStrip taskId={task.id} />
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectChange?.(e.target.checked)}
            aria-label={`Select "${task.title}"`}
            className="mt-1"
          />
        )}
        <input
          type="checkbox"
          checked={task.status === "done"}
          onChange={() => onToggleDone(task)}
          className="mt-1"
        />
        <div>
          <p
            className={`text-sm font-medium text-zinc-900 dark:text-zinc-100 ${
              task.status === "done" ? "line-through opacity-60" : ""
            }`}
          >
            {task.title}
          </p>
          {notesPreview && <p className="mt-0.5 text-sm text-zinc-500">{notesPreview}</p>}
          <p className="mt-1 text-xs text-zinc-500">
            {task.status} · {task.priority} priority
            {domain ? ` · ${domain.name}` : ""}
            {project ? ` · ${project.name}` : ""}
            {task.due_date ? ` · due ${task.due_date}` : ""}
            {task.scheduled_date ? ` · scheduled ${task.scheduled_date}` : ""}
          </p>
          <AttachmentStrip taskId={task.id} />
          {task.source_html && <OriginalEmail html={task.source_html} />}
        </div>
      </div>
      <div className="flex shrink-0 gap-3">
        <button
          onClick={startEdit}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="text-sm font-medium text-red-600 hover:text-red-700"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
