"use client";

import { useState } from "react";
import SmartListHeader from "@/components/smart-list-header";
import ReorderableTaskList from "@/components/reorderable-task-list";
import ClarifyFlow from "@/components/clarify-flow";
import MindSweepFlow from "@/components/mind-sweep-flow";
import InboxCaptureForm from "@/components/inbox/capture-form";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { isInInbox } from "@/lib/tasks/inbox";
import { todayLocal } from "@/lib/date";

export default function InboxPage() {
  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    handleUpdate,
    toggleDone,
    handleDelete,
    createTask,
    handleConvertToProject,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
    loadAll,
  } = useTaskList({ done: false });

  const [createError, setCreateError] = useState<string | null>(null);

  const inboxTasks = tasks.filter((t) => isInInbox(t, todayLocal()));

  // Snapshot of ids when Clarify starts, so the flow's order and progress
  // count stay stable while individual actions reshuffle the live list.
  const [clarifyQueue, setClarifyQueue] = useState<string[] | null>(null);
  const [sweeping, setSweeping] = useState(false);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📥" color="#3b82f6" title="Inbox" count={inboxTasks.length} />

      {(error || createError) && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error || createError}
        </p>
      )}

      <InboxCaptureForm
        domains={domains}
        projects={projects}
        createTask={createTask}
        loadAll={loadAll}
        setCreateError={setCreateError}
      />

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : sweeping ? (
        <MindSweepFlow
          onCreateTask={createTask}
          onStartClarify={() => {
            setSweeping(false);
            setClarifyQueue(inboxTasks.map((t) => t.id));
          }}
          onExit={() => setSweeping(false)}
        />
      ) : clarifyQueue ? (
        <ClarifyFlow
          queue={clarifyQueue}
          tasks={tasks}
          domains={domains}
          projects={projects}
          onUpdate={handleUpdate}
          onTrash={(id) => handleDelete(id, undefined, true)}
          onToggleDone={toggleDone}
          onConvertToProject={(id) => handleConvertToProject(id, true)}
          onConvertToReference={(id) => handleConvertToKnowledgeItem(id, true)}
          onCreateTask={createTask}
          onExit={() => setClarifyQueue(null)}
        />
      ) : inboxTasks.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">Nothing unprocessed — inbox is clear.</p>
          <button
            onClick={() => setSweeping(true)}
            title="GTD mind sweep — guided trigger list, rapid capture to the Inbox"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            🧠 Mind Sweep — empty your head
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              💡 GTD&apos;s two-minute rule: if something here takes less than two minutes, just do
              it now instead of filing it.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setSweeping(true)}
                title="GTD mind sweep — guided trigger list, rapid capture to the Inbox"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                🧠 Mind Sweep
              </button>
              <button
                onClick={() => setClarifyQueue(inboxTasks.map((t) => t.id))}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                ⚡ Clarify ({inboxTasks.length})
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            <ReorderableTaskList
              tasks={inboxTasks}
              onReordered={loadAll}
              domains={domains}
              projects={projects}
              onToggleDone={toggleDone}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onConvertToProject={handleConvertToProject}
              onConvertToRecurring={handleConvertToRecurring}
              onConvertToKnowledgeItem={handleConvertToKnowledgeItem}
            />
          </ul>
        </>
      )}
    </div>
  );
}
