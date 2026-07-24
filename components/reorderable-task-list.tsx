"use client";

import { useState } from "react";
import TaskRow, { type Task, type TaskDomain, type TaskProject } from "@/components/task-row";
import RecurringTaskGroup from "@/components/recurring-task-group";
import { groupRecurringTasks } from "@/lib/recurring-tasks/group";
import type { RecurrencePatternDraft } from "@/components/recurrence-fields";

type CommonRowProps = {
  domains: TaskDomain[];
  projects: TaskProject[];
  onToggleDone: (task: Task) => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onDelete: (id: string, scope?: "skip" | "following") => void;
  onConvertToProject?: (id: string) => void;
  onConvertToRecurring?: (id: string, pattern: RecurrencePatternDraft) => void;
  onConvertToKnowledgeItem?: (id: string) => void;
};

/**
 * A task list you can drag into any order. Same HTML5 drag pattern as the
 * Domains page reorder: drag over a row swaps positions locally, drop
 * commits the whole list's order in one POST /api/tasks/reorder (which
 * stamps sort_order = index). Recurring-series groups still render, but
 * aren't draggable — a group is a synthetic row over several tasks, and
 * ordering happens between real rows.
 */
export default function ReorderableTaskList({
  tasks,
  onReordered,
  ...rowProps
}: CommonRowProps & {
  /** Tasks in current display order. */
  tasks: Task[];
  /** Called after a successful order commit — refetch here. */
  onReordered: () => Promise<void> | void;
}) {
  // Local order (ids) while dragging; resynced whenever the incoming task
  // set changes (render-adjust, keyed on the joined id list).
  const [order, setOrder] = useState<string[]>(() => tasks.map((t) => t.id));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incomingKey = tasks.map((t) => t.id).join("|");
  const [prevKey, setPrevKey] = useState(incomingKey);
  if (incomingKey !== prevKey) {
    setPrevKey(incomingKey);
    setOrder(tasks.map((t) => t.id));
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = order.map((id) => byId.get(id)).filter((t): t is Task => !!t);

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    setOrder((prev) => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function handleDragEnd() {
    if (!draggedId) return;
    setDraggedId(null);

    const res = await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: order }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save the new order — try again.");
      return;
    }
    setError(null);
    await onReordered();
  }

  const entries = groupRecurringTasks(ordered);

  return (
    <>
      {error && (
        <li className="list-none rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </li>
      )}
      {entries.map((entry) =>
        entry.type === "group" ? (
          <RecurringTaskGroup key={entry.templateId} tasks={entry.tasks} {...rowProps} />
        ) : (
          <TaskRow
            key={entry.task.id}
            task={entry.task}
            {...rowProps}
            dragProps={{
              onDragStart: () => setDraggedId(entry.task.id),
              onDragOver: (e) => handleDragOver(e, entry.task.id),
              onDragEnd: handleDragEnd,
              dragging: draggedId === entry.task.id,
            }}
          />
        ),
      )}
    </>
  );
}
