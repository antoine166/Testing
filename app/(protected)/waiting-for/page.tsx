"use client";

import SmartListHeader from "@/components/smart-list-header";
import TaskRow from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";

export default function WaitingForPage() {
  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    handleUpdate,
    toggleDone,
    handleDelete,
    handleConvertToProject,
  } = useTaskList();

  const waitingTasks = tasks
    .filter((t) => t.waiting_for && t.status !== "done")
    .sort((a, b) => (a.waiting_since ?? "").localeCompare(b.waiting_since ?? ""));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="⏳" color="#f97316" title="Waiting For" count={waitingTasks.length} />

      <p className="mb-6 text-sm text-zinc-500">
        Things you&rsquo;re not moving forward on yourself &mdash; delegated or blocked on someone
        else. Sorted oldest first, so anything overdue for a nudge rises to the top.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : waitingTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing outstanding &mdash; check &ldquo;Waiting for&rdquo; from a task&rsquo;s edit form
          when you hand something off to someone else.
        </p>
      ) : (
        <ul className="space-y-2">
          {waitingTasks.map((task) => (
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
