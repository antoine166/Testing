"use client";

import { useState, type FormEvent } from "react";
import SmartListHeader from "@/components/smart-list-header";
import TaskRow from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";

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
  } = useTaskList();

  const [captureMode, setCaptureMode] = useState<"task" | "project">("task");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const inboxTasks = tasks.filter(
    (t) => !t.domain_id && !t.someday && t.status !== "done",
  );

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setCreateError(null);

    if (captureMode === "project") {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title }),
      });
      setSubmitting(false);
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? "Failed to create project");
        return;
      }
      setTitle("");
      return;
    }

    const ok = await createTask({ title });
    setSubmitting(false);
    if (ok) setTitle("");
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📥" color="#3b82f6" title="Inbox" count={inboxTasks.length} />

      {(error || createError) && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error || createError}
        </p>
      )}

      <form onSubmit={handleCreate} className="mb-6 space-y-2">
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
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={captureMode === "task" ? "Capture something..." : "New project name"}
            disabled={submitting}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Add
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : inboxTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing unprocessed — inbox is clear.</p>
      ) : (
        <ul className="space-y-2">
          {inboxTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              domains={domains}
              projects={projects}
              onToggleDone={toggleDone}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onConvertToProject={handleConvertToProject}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
