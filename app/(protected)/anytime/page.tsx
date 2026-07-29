"use client";

import SmartListHeader from "@/components/smart-list-header";
import ReorderableTaskList from "@/components/reorderable-task-list";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { useListOrder } from "@/lib/hooks/use-list-order";
import { applyListOrder } from "@/lib/tasks/list-order";

export default function AnytimePage() {
  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    handleUpdate,
    toggleDone,
    handleDelete,
    handleConvertToProjectAndPlan,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
  } = useTaskList({ done: false });

  // Per-page manual order (#142); unordered tasks stay on top, newest first.
  const { positions, refresh: refreshOrder } = useListOrder("anytime");
  // Filed under a domain, no specific date, not deferred to Someday — actionable whenever.
  const anytimeTasks = applyListOrder(
    tasks.filter((t) => t.domain_id && !t.scheduled_date && !t.someday && t.status !== "done"),
    positions,
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📚" color="#14b8a6" title="Anytime" count={anytimeTasks.length} />

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : anytimeTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing here — filed tasks with no date show up when you have them.</p>
      ) : (
        <ul className="space-y-2">
          <ReorderableTaskList
            tasks={anytimeTasks}
            listKey="anytime"
            onReordered={refreshOrder}
            domains={domains}
            projects={projects}
            onToggleDone={toggleDone}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onConvertToProject={handleConvertToProjectAndPlan}
            onConvertToRecurring={handleConvertToRecurring}
            onConvertToKnowledgeItem={handleConvertToKnowledgeItem}
          />
        </ul>
      )}
    </div>
  );
}
