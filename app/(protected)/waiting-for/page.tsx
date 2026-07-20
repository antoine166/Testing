"use client";

import { useState } from "react";
import SmartListHeader from "@/components/smart-list-header";
import TaskRow from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { todayLocal } from "@/lib/date";

export default function WaitingForPage() {
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
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
  } = useTaskList();

  const [personFilter, setPersonFilter] = useState("");

  const today = todayLocal();
  const allWaitingTasks = tasks
    .filter((t) => t.waiting_for && t.status !== "done")
    .sort((a, b) => (a.waiting_since ?? "").localeCompare(b.waiting_since ?? ""));
  const people = [...new Set(allWaitingTasks.map((t) => t.waiting_on).filter((p): p is string => !!p))].sort();
  const waitingTasks = personFilter
    ? allWaitingTasks.filter((t) => t.waiting_on === personFilter)
    : allWaitingTasks;
  // An explicit follow_up_date is an active prompt ("nudge me on this
  // date"), distinct from the passive elapsed-days sort below it.
  const readyToFollowUp = waitingTasks.filter((t) => t.follow_up_date && t.follow_up_date <= today);
  const rest = waitingTasks.filter((t) => !(t.follow_up_date && t.follow_up_date <= today));

  const rowProps = {
    domains,
    projects,
    onToggleDone: toggleDone,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
    onConvertToProject: handleConvertToProject,
    onConvertToRecurring: handleConvertToRecurring,
    onConvertToKnowledgeItem: handleConvertToKnowledgeItem,
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="⏳" color="#f97316" title="Waiting For" count={waitingTasks.length} />

      <p className="mb-4 text-sm text-zinc-500">
        Things you&rsquo;re not moving forward on yourself &mdash; delegated or blocked on someone
        else. Sorted oldest first, so anything overdue for a nudge rises to the top.
      </p>

      {people.length > 0 && (
        <div className="mb-6 flex items-center gap-2">
          <label htmlFor="person-filter" className="text-sm text-zinc-500">
            Waiting on
          </label>
          <select
            id="person-filter"
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : allWaitingTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing outstanding &mdash; check &ldquo;Waiting for&rdquo; from a task&rsquo;s edit form
          when you hand something off to someone else.
        </p>
      ) : waitingTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing waiting on {personFilter} right now.</p>
      ) : (
        <>
          {readyToFollowUp.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-500">
                🔔 Follow up now ({readyToFollowUp.length})
              </h2>
              <ul className="space-y-2">
                {readyToFollowUp.map((task) => (
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
