"use client";

import SmartListHeader from "@/components/smart-list-header";
import TaskRow from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";

export default function InboxPage() {
  const { domains, projects, tasks, loading, error, handleUpdate, toggleDone, handleDelete } =
    useTaskList();

  const inboxTasks = tasks.filter(
    (t) => !t.domain_id && !t.someday && t.status !== "done",
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📥" color="#3b82f6" title="Inbox" count={inboxTasks.length} />

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

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
            />
          ))}
        </ul>
      )}
    </div>
  );
}
