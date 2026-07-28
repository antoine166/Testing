"use client";

import SmartListHeader from "@/components/smart-list-header";
import { monthLabel } from "@/lib/date";
import TaskRow, { type Task } from "@/components/task-row";
import { useLeaveTransition, type RemovalKind } from "@/components/leave-transition";
import { renderGroupedEntries } from "@/components/recurring-task-group";
import { groupRecurringTasks } from "@/lib/recurring-tasks/group";
import { useTaskList } from "@/lib/hooks/use-task-list";

export default function LogbookPage() {
  const { domains, projects, tasks, loading, error, handleUpdate, toggleDone, handleDelete } =
    useTaskList({ done: true });

  const doneTasks = [...tasks]
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  // Un-checking a task removes it from this done-only list — keep a
  // snapshot row collapsing (↩️ badge) in its month instead of the list
  // snapping shut (#138). Leaving rows render at the top of their month:
  // close enough, and it keeps the recurring-series grouping untouched.
  const leavingByMonth = new Map<string, { task: Task; kind: RemovalKind }[]>();
  for (const l of useLeaveTransition(doneTasks)) {
    const label = l.item.completed_at ? monthLabel(l.item.completed_at) : "Undated";
    if (!leavingByMonth.has(label)) leavingByMonth.set(label, []);
    leavingByMonth.get(label)!.push({ task: l.item, kind: l.kind });
  }

  const byMonth = new Map<string, Task[]>();
  for (const task of doneTasks) {
    const label = task.completed_at ? monthLabel(task.completed_at) : "Undated";
    if (!byMonth.has(label)) byMonth.set(label, []);
    byMonth.get(label)!.push(task);
  }
  for (const label of leavingByMonth.keys()) {
    // A month whose last visible task just left still needs its section
    // rendered for the collapse to play.
    if (!byMonth.has(label)) byMonth.set(label, []);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="✓" color="#22c55e" title="Logbook" />

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : byMonth.size === 0 ? (
        <p className="text-sm text-zinc-500">Nothing completed yet.</p>
      ) : (
        <div className="space-y-6">
          {[...byMonth.entries()].map(([label, monthTasks]) => (
            <div key={label}>
              <h2 className="mb-2 border-b border-zinc-200 pb-1 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                {label}
              </h2>
              <ul className="space-y-2">
                {(leavingByMonth.get(label) ?? []).map(({ task, kind }) => (
                  <TaskRow
                    key={`leaving-${task.id}`}
                    task={task}
                    leaving={kind}
                    domains={domains}
                    projects={projects}
                    onToggleDone={toggleDone}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
                {renderGroupedEntries(groupRecurringTasks(monthTasks), {
                  domains,
                  projects,
                  onToggleDone: toggleDone,
                  onUpdate: handleUpdate,
                  onDelete: handleDelete,
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
