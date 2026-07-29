"use client";

import Link from "next/link";
import SmartListHeader from "@/components/smart-list-header";
import { monthLabel } from "@/lib/date";
import TaskRow, { type Task, type TaskProject } from "@/components/task-row";
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

  // Completed projects live here too — they leave the browsing pages when
  // finished, sorted and bucketed by when they were completed.
  const completedProjects = projects
    .filter((p) => p.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const projectsByMonth = new Map<string, TaskProject[]>();
  for (const project of completedProjects) {
    const label = project.completed_at ? monthLabel(project.completed_at) : "Undated";
    if (!projectsByMonth.has(label)) projectsByMonth.set(label, []);
    projectsByMonth.get(label)!.push(project);
  }

  const domainsById = new Map(domains.map((d) => [d.id, d]));

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
      ) : byMonth.size === 0 && completedProjects.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing completed yet.</p>
      ) : (
        <div className="space-y-6">
          {completedProjects.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Completed projects
              </h2>
              <div className="space-y-4">
                {[...projectsByMonth.entries()].map(([label, monthProjects]) => (
                  <div key={label}>
                    <h3 className="mb-2 border-b border-zinc-200 pb-1 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                      {label}
                    </h3>
                    <ul className="space-y-2">
                      {monthProjects.map((project) => {
                        const domain = project.domain_id
                          ? domainsById.get(project.domain_id)
                          : undefined;
                        return (
                          <li
                            key={project.id}
                            className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                          >
                            <span aria-hidden="true">🎉</span>
                            {domain && (
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: domain.color }}
                                title={domain.name}
                              />
                            )}
                            <Link
                              href={`/projects/${project.id}`}
                              className="min-w-0 flex-1 truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                            >
                              {project.name}
                            </Link>
                            {project.completed_at && (
                              <span className="shrink-0 text-xs text-zinc-500">
                                {new Date(project.completed_at).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
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
