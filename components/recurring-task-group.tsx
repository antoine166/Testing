"use client";

import { useState } from "react";
import TaskRow, { type Task, type TaskDomain, type TaskProject } from "@/components/task-row";
import { groupRecurringTasks, type GroupedEntry } from "@/lib/recurring-tasks/group";

type CommonRowProps = {
  domains: TaskDomain[];
  projects: TaskProject[];
  onToggleDone: (task: Task) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string, scope?: "skip" | "following") => void;
  onConvertToProject?: (id: string) => void;
};

type Props = CommonRowProps & { tasks: Task[] };

/** Renders already-computed group/single entries — for callers (Upcoming) that need to group across a wider set than what ends up rendered together (e.g. before bucketing by date), so grouping can't just happen inline per-bucket. */
export function renderGroupedEntries(entries: GroupedEntry<Task>[], common: CommonRowProps) {
  return entries.map((entry) =>
    entry.type === "group" ? (
      <RecurringTaskGroup key={entry.templateId} tasks={entry.tasks} {...common} />
    ) : (
      <TaskRow key={entry.task.id} task={entry.task} {...common} />
    ),
  );
}

/**
 * Drop-in replacement for `tasks.map((task) => <TaskRow ... />)` that
 * consolidates recurring-series occurrences via RecurringTaskGroup. Used
 * identically across Tasks and Domains so those pages don't each duplicate
 * the group-vs-single branching.
 */
export function renderGroupedTaskRows(tasks: Task[], common: CommonRowProps) {
  return renderGroupedEntries(groupRecurringTasks(tasks), common);
}

/**
 * Consolidates multiple occurrences of the same recurring task into one
 * row (the earliest occurrence, plus a "+N more" toggle) instead of
 * listing every pre-generated instance separately — otherwise a list can
 * read as N unrelated-looking tasks that all happen to share a title.
 */
export default function RecurringTaskGroup({
  tasks,
  domains,
  projects,
  onToggleDone,
  onUpdate,
  onDelete,
  onConvertToProject,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [first, ...rest] = tasks;

  const rowProps = { domains, projects, onToggleDone, onUpdate, onDelete, onConvertToProject };

  if (expanded) {
    return (
      <>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} {...rowProps} />
        ))}
        <li>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full rounded-md border border-dashed border-zinc-300 px-4 py-2 text-left text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
          >
            Collapse
          </button>
        </li>
      </>
    );
  }

  return (
    <>
      <TaskRow key={first.id} task={first} {...rowProps} />
      <li>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-md border border-dashed border-zinc-300 px-4 py-2 text-left text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
        >
          ↻ +{rest.length} more
        </button>
      </li>
    </>
  );
}
