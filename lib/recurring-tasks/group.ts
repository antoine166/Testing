type TaskLike = { id: string; recurring_template_id?: string | null; scheduled_date?: string | null };

export type GroupedEntry<T> = { type: "single"; task: T } | { type: "group"; templateId: string; tasks: T[] };

/**
 * Consolidates every occurrence of the same recurring template present in
 * `tasks` into a single group entry (only when 2+ are present), so a list
 * doesn't read as N identical-looking unrelated tasks. A group's own tasks
 * are sorted so its earliest scheduled_date is always the representative
 * ("next occurrence, +N more"), independent of the input array's overall
 * order (e.g. /api/tasks sorts by created_at desc, which is the reverse of
 * scheduled_date order for a template's occurrences — they're all
 * generated, and so created, in ascending date order in one batch). The
 * group's position in the result is wherever its first member is
 * encountered in the input array.
 */
export function groupRecurringTasks<T extends TaskLike>(tasks: T[]): GroupedEntry<T>[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!task.recurring_template_id) continue;
    counts.set(task.recurring_template_id, (counts.get(task.recurring_template_id) ?? 0) + 1);
  }

  const emitted = new Set<string>();
  const result: GroupedEntry<T>[] = [];

  for (const task of tasks) {
    const templateId = task.recurring_template_id;
    if (templateId && (counts.get(templateId) ?? 0) >= 2) {
      if (emitted.has(templateId)) continue;
      emitted.add(templateId);
      const groupTasks = tasks
        .filter((t) => t.recurring_template_id === templateId)
        .sort((a, b) => (a.scheduled_date ?? "9999-99-99").localeCompare(b.scheduled_date ?? "9999-99-99"));
      result.push({ type: "group", templateId, tasks: groupTasks });
    } else {
      result.push({ type: "single", task });
    }
  }

  return result;
}
