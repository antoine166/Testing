import type { Task } from "@/components/task-row";

/**
 * Pure helpers for optimistic (local-first) task mutations in
 * lib/hooks/use-task-list.ts: apply the user's change to local state
 * immediately, let the server write happen in the background, and revert
 * if it fails. Kept out of the hook so the reconciliation rules are unit
 * testable without React.
 */

/** The user's edit, applied locally the instant they make it. */
export function applyTaskUpdates(
  tasks: Task[],
  id: string,
  updates: Record<string, unknown>,
): Task[] {
  return tasks.map((t) => (t.id === id ? ({ ...t, ...updates } as Task) : t));
}

/**
 * Reconcile the server's authoritative row into local state. The PUT
 * response is a bare table row: server-computed fields (completed_at,
 * waiting_since, cleared waiting_on/follow_up_date) must win — including
 * explicit nulls — but keys the bare row doesn't carry at all (the
 * recurring_task_templates join, attachment_count from the list endpoint)
 * must survive from the local copy, or rows would lose their recurrence
 * badge and thumbnail state after every edit.
 */
export function mergeServerTask(tasks: Task[], serverTask: Task): Task[] {
  return tasks.map((t) => (t.id === serverTask.id ? { ...t, ...serverTask } : t));
}

export function removeTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.id !== id);
}

/**
 * Local mirror of DELETE /api/tasks/[id]?scope=following — same template,
 * not done, scheduled on/after the anchor occurrence. Tasks with no
 * scheduled_date are kept, matching SQL `gte` semantics on NULL.
 */
export function removeSeriesFrom(tasks: Task[], anchor: Task): Task[] {
  if (!anchor.recurring_template_id) return tasks;
  const from = anchor.scheduled_date ?? "0000-01-01";
  return tasks.filter(
    (t) =>
      !(
        t.recurring_template_id === anchor.recurring_template_id &&
        t.status !== "done" &&
        t.scheduled_date != null &&
        t.scheduled_date >= from
      ),
  );
}

/**
 * True when the write triggers server-side effects that merging the
 * response row can't capture: completing an occurrence of an
 * after-completion recurring task generates the NEXT occurrence on the
 * server, so only a full reload will show it.
 */
export function needsFullReload(
  task: Task | undefined,
  updates: Record<string, unknown>,
): boolean {
  return updates.status === "done" && Boolean(task?.recurring_template_id);
}
