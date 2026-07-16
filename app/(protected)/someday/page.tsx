"use client";

import SmartListHeader from "@/components/smart-list-header";
import TaskRow from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";

export default function SomedayPage() {
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

  const somedayTasks = tasks.filter((t) => t.someday && t.status !== "done");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📦" color="#d97706" title="Someday" count={somedayTasks.length} />

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : somedayTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing deferred — mark a task &ldquo;Someday&rdquo; from its edit form to stash it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {somedayTasks.map((task) => (
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
