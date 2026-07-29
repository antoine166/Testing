"use client";

import { useEffect, useRef, useState } from "react";
import TaskRow, { type Task, type TaskDomain, type TaskProject } from "@/components/task-row";
import RecurringTaskGroup from "@/components/recurring-task-group";
import { groupRecurringTasks } from "@/lib/recurring-tasks/group";
import { useLeaveTransition } from "@/components/leave-transition";
import { usePointerDrag, useRowFlip } from "@/lib/hooks/use-pointer-drag";
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
 * A task list you can drag into any order. Two mechanisms share the same
 * order state: HTML5 drag on the row for desktop mice (same pattern as the
 * Domains page reorder), and pointer-event drag on the grab handle for
 * touch (press-and-hold, via usePointerDrag — HTML5 drag events never fire
 * on touch). Drop commits the whole list's order in one POST
 * /api/tasks/reorder: with a `listKey` (#142) that saves per-page
 * positions in list_orders; without one it stamps the legacy global
 * sort_order. Recurring-series groups still render, but aren't draggable —
 * a group is a synthetic row over several tasks, and ordering happens
 * between real rows.
 */
export default function ReorderableTaskList({
  tasks,
  onReordered,
  listKey,
  ...rowProps
}: CommonRowProps & {
  /** Tasks in current display order. */
  tasks: Task[];
  /** Called after a successful order commit — refetch here. */
  onReordered: () => Promise<void> | void;
  /** Save positions per page under this key instead of the global sort_order. */
  listKey?: string;
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

  // Commits read the ref, not the state — the touch path's drop fires from
  // an event handler whose closure may predate the last onOver swap.
  // Synced in an effect (not during render), per the react-hooks rules.
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  });

  function moveInOrder(draggedId: string, targetId: string) {
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

  async function commitOrder() {
    const ids = orderRef.current;
    const res = await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listKey ? { ids, list_key: listKey } : { ids }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save the new order — try again.");
      return;
    }
    setError(null);
    await onReordered();
  }

  // Touch/pen path — long-press the handle, move to swap, lift to commit.
  // #154: swaps capture row positions first so displaced neighbors FLIP-
  // glide to their new slot (touch only — the HTML5 desktop path below
  // never captures, so desktop behavior is unchanged). Recurring-group
  // rows carry no data-drag-id, so they still reposition instantly.
  const pointer = usePointerDrag({ onOver: handlePointerOver, onDrop: () => void commitOrder() });
  const flip = useRowFlip(order, pointer.draggingId);
  function handlePointerOver(dragged: string, target: string) {
    flip.capture();
    moveInOrder(dragged, target);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    moveInOrder(draggedId, targetId);
  }

  async function handleDragEnd() {
    if (!draggedId) return;
    setDraggedId(null);
    await commitOrder();
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = order.map((id) => byId.get(id)).filter((t): t is Task => !!t);

  const entries = groupRecurringTasks(ordered);

  // Rows that just left the list stay mounted briefly (flagged leaving) so
  // their space collapses instead of snapping shut (#121/#138). Approximate
  // position: the flat pre-grouping index — close enough visually.
  const leavingEntries = useLeaveTransition(ordered);
  type DisplayEntry =
    | (typeof entries)[number]
    | { type: "leaving"; task: Task; kind: (typeof leavingEntries)[number]["kind"] };
  const display: DisplayEntry[] = [...entries];
  for (const l of leavingEntries) {
    display.splice(Math.min(l.index, display.length), 0, {
      type: "leaving",
      task: l.item,
      kind: l.kind,
    });
  }

  return (
    <>
      {error && (
        <li className="list-none rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </li>
      )}
      {display.map((entry) =>
        entry.type === "group" ? (
          <RecurringTaskGroup key={entry.templateId} tasks={entry.tasks} {...rowProps} />
        ) : entry.type === "leaving" ? (
          <TaskRow
            key={`leaving-${entry.task.id}`}
            task={entry.task}
            {...rowProps}
            leaving={entry.kind}
          />
        ) : (
          <TaskRow
            key={entry.task.id}
            task={entry.task}
            {...rowProps}
            dragProps={{
              onDragStart: () => setDraggedId(entry.task.id),
              onDragOver: (e) => handleDragOver(e, entry.task.id),
              onDragEnd: handleDragEnd,
              dragging: draggedId === entry.task.id || pointer.draggingId === entry.task.id,
              handleProps: pointer.handleProps(entry.task.id),
            }}
          />
        ),
      )}
    </>
  );
}
