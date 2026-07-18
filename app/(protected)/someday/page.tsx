"use client";

import SmartListHeader from "@/components/smart-list-header";
import TaskRow from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { todayLocal } from "@/lib/date";

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

  const today = todayLocal();
  const somedayTasks = tasks.filter((t) => t.someday && t.status !== "done");
  // GTD's tickler file: a date-specific trigger that's arrived means this
  // is due for reconsideration, not just sitting in the pile indefinitely.
  const readyToRevisit = somedayTasks.filter((t) => t.revisit_date && t.revisit_date <= today);
  const rest = somedayTasks.filter((t) => !(t.revisit_date && t.revisit_date <= today));

  const rowProps = {
    domains,
    projects,
    onToggleDone: toggleDone,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
    onConvertToProject: handleConvertToProject,
  };

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
        <>
          {readyToRevisit.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-500">
                🔔 Ready to revisit ({readyToRevisit.length})
              </h2>
              <ul className="space-y-2">
                {readyToRevisit.map((task) => (
                  <TaskRow key={task.id} task={task} {...rowProps} />
                ))}
              </ul>
            </div>
          )}
          {rest.length > 0 && (
            <ul className="space-y-2">
              {rest.map((task) => (
                <TaskRow key={task.id} task={task} {...rowProps} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
