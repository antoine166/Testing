"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TaskRow from "@/components/task-row";
import { usePageData } from "@/lib/hooks/use-page-data";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { useListOrder } from "@/lib/hooks/use-list-order";
import { applyListOrder } from "@/lib/tasks/list-order";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { isInInbox } from "@/lib/tasks/inbox";
import { todayLocal } from "@/lib/date";
import { renderGroupedTaskRows } from "@/components/recurring-task-group";
import ReorderableTaskList from "@/components/reorderable-task-list";
import TaskCreateForm from "@/components/tasks/create-form";
import ProjectToolbar from "@/components/project-toolbar";
import RecurringTemplatesSection, {
  type RecurringTemplate,
} from "@/components/tasks/recurring-templates-section";

export default function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const domainFilter = searchParams.get("domain");
  const projectFilter = searchParams.get("project");
  const searchQuery = searchParams.get("q");
  const editTemplateId = searchParams.get("editTemplate");
  const { confirm } = useConfirmDialog();

  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    setError,
    handleUpdate,
    toggleDone,
    handleDelete,
    handleConvertToProject,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
    loadAll,
  } = useTaskList({ onAfterRefresh: () => loadRecurringTemplates() });

  const [recurringTemplates, setRecurringTemplates] = useState<RecurringTemplate[]>([]);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDomainId, setBulkDomainId] = useState("");
  const [bulkScheduleDate, setBulkScheduleDate] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // The page's main loading/error surface comes from useTaskList; template
  // load failures were (and stay) silent, so only `reload` is destructured.
  // A project-filtered view shows that project's reference material too
  // (#132 follow-up): same 📖 block as the Projects page, so filed-as-
  // reference items stay visible next to the project's tasks.
  const [referenceItems, setReferenceItems] = useState<
    { id: string; title: string; type: string; url: string | null; project_id: string | null }[]
  >([]);
  usePageData(
    async (signal) => {
      if (!projectFilter) return;
      const res = await fetch("/api/knowledge-items", { signal });
      if (res.ok) setReferenceItems(await res.json());
    },
    { tables: ["knowledge_items"] },
  );
  const projectReferences = projectFilter
    ? referenceItems.filter((i) => i.project_id === projectFilter)
    : [];

  const { reload: loadRecurringTemplates } = usePageData(
    async (signal) => {
      const res = await fetch("/api/recurring-task-templates", { signal });
      if (res.ok) setRecurringTemplates(await res.json());
    },
    { tables: ["recurring_task_templates"] },
  );

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
    setBulkDomainId("");
    setBulkScheduleDate("");
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runBulkAction(
    action: (id: string) => Promise<Response>,
    errorMessage: string,
  ) {
    if (selectedIds.size === 0) return;

    setBulkBusy(true);
    const results = await Promise.all([...selectedIds].map(action));
    setBulkBusy(false);

    if (results.some((res) => !res.ok)) {
      setError(errorMessage);
    }

    setSelectedIds(new Set());
    setBulkDomainId("");
    setBulkScheduleDate("");
    setSelectMode(false);
    await loadAll();
  }

  async function handleBulkFile() {
    if (!bulkDomainId) return;
    await runBulkAction(
      (id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain_id: bulkDomainId }),
        }),
      "Some tasks couldn't be filed — try again.",
    );
  }

  async function handleBulkComplete() {
    await runBulkAction(
      (id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        }),
      "Some tasks couldn't be completed — try again.",
    );
  }

  async function handleBulkSchedule() {
    if (!bulkScheduleDate) return;
    await runBulkAction(
      (id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduled_date: bulkScheduleDate }),
        }),
      "Some tasks couldn't be scheduled — try again.",
    );
  }

  async function handleBulkDelete() {
    if (
      !(await confirm({
        message: `Move ${selectedIds.size} task${selectedIds.size === 1 ? "" : "s"} to trash? You can restore them within 30 days.`,
        confirmLabel: "Move to Trash",
        danger: true,
      }))
    )
      return;
    await runBulkAction(
      (id) => fetch(`/api/tasks/${id}`, { method: "DELETE" }),
      "Some tasks couldn't be deleted — try again.",
    );
  }

  // Per-page manual order (#142) — only the project-filtered view is
  // hand-orderable here, under the same key as the project detail page so
  // both surfaces share one arrangement.
  const { positions, refresh: refreshOrder } = useListOrder(
    projectFilter ? `project:${projectFilter}` : undefined,
  );

  const inboxTasks = tasks.filter((t) => isInInbox(t, todayLocal()));
  const processedTasks = tasks.filter((t) => t.domain_id && t.status !== "done");

  const filteredTasks = searchQuery
    ? tasks.filter(
        (t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()) && t.status !== "done",
      )
    : domainFilter
      ? tasks.filter((t) => t.domain_id === domainFilter && t.status !== "done")
      : projectFilter
        ? applyListOrder(
            tasks.filter((t) => t.project_id === projectFilter && t.status !== "done"),
            positions,
          )
        : null;
  const filterLabel = searchQuery
    ? `"${searchQuery}"`
    : domainFilter
      ? (domains.find((d) => d.id === domainFilter)?.name ?? "this domain")
      : (projects.find((p) => p.id === projectFilter)?.name ?? "this project");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Tasks
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {(searchQuery || domainFilter || projectFilter) && (
        <p className="mb-4 text-sm text-zinc-500">
          {searchQuery ? "Showing tasks matching" : "Showing tasks in"}{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">{filterLabel}</strong>
          {" — "}
          <Link href="/tasks" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
            Clear filter
          </Link>
        </p>
      )}

      {(() => {
        // The project's action row, on the view its ≔ button lands on —
        // Antoine's call: the tools live where you work the project.
        const filteredProject = projectFilter
          ? projects.find((p) => p.id === projectFilter)
          : undefined;
        if (!filteredProject) return null;
        return (
          <div className="-mt-2 mb-4 flex items-center gap-1">
            <ProjectToolbar
              project={filteredProject}
              hasSubprojects={projects.some((p) => p.parent_project_id === filteredProject.id)}
              openCount={(filteredTasks ?? []).length}
              onError={setError}
              onChanged={loadAll}
              afterDelete={() => router.push("/tasks")}
            />
          </div>
        );
      })()}

      <TaskCreateForm
        domains={domains}
        projects={projects}
        domainFilter={domainFilter}
        projectFilter={projectFilter}
        setError={setError}
        loadRecurringTemplates={loadRecurringTemplates}
        loadAll={loadAll}
      />

      <RecurringTemplatesSection
        recurringTemplates={recurringTemplates}
        domains={domains}
        projects={projects}
        editTemplateId={editTemplateId}
        setError={setError}
        loadRecurringTemplates={loadRecurringTemplates}
      />

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : filteredTasks ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Tasks {filteredTasks.length > 0 && `(${filteredTasks.length})`}
          </h2>
          {filteredTasks.length === 0 ? (
            <p className="text-sm text-zinc-500">No tasks here yet.</p>
          ) : (
            <ul className="space-y-2">
              {projectFilter ? (
                // A single project's list is one the user hand-orders —
                // drag to arrange; other filters (search, domain) keep the
                // standard ordering.
                <ReorderableTaskList
                  tasks={filteredTasks}
                  listKey={`project:${projectFilter}`}
                  onReordered={refreshOrder}
                  domains={domains}
                  projects={projects}
                  onToggleDone={toggleDone}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onConvertToProject={handleConvertToProject}
                  onConvertToRecurring={handleConvertToRecurring}
                  onConvertToKnowledgeItem={handleConvertToKnowledgeItem}
                />
              ) : (
                renderGroupedTaskRows(filteredTasks, {
                  domains,
                  projects,
                  onToggleDone: toggleDone,
                  onUpdate: handleUpdate,
                  onDelete: handleDelete,
                  onConvertToProject: handleConvertToProject,
                  onConvertToRecurring: handleConvertToRecurring,
                  onConvertToKnowledgeItem: handleConvertToKnowledgeItem,
                })
              )}
            </ul>
          )}

          {/* The project's filed reference material, below its tasks —
              support material shouldn't outrank the next actions. */}
          {projectReferences.length > 0 && (
            <div className="mt-6 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Reference
              </p>
              <ul className="mt-1 space-y-0.5">
                {projectReferences.map((item) => (
                  <li key={item.id} className="flex items-center gap-1.5 text-sm">
                    <span className="text-xs">📖</span>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-600 underline dark:text-blue-400"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <Link href="/library" className="truncate hover:underline">
                        {item.title}
                      </Link>
                    )}
                    <span className="text-xs text-zinc-400">{item.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Inbox {inboxTasks.length > 0 && `(${inboxTasks.length})`}
              </h2>
              {inboxTasks.length > 0 && (
                <button
                  onClick={toggleSelectMode}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                >
                  {selectMode ? "Cancel" : "Select"}
                </button>
              )}
            </div>

            {selectMode && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === inboxTasks.length}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? new Set(inboxTasks.map((t) => t.id)) : new Set())
                    }
                  />
                  Select all
                </label>
                <span className="text-sm text-zinc-500">{selectedIds.size} selected</span>
                <select
                  value={bulkDomainId}
                  onChange={(e) => setBulkDomainId(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">File to domain...</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleBulkFile}
                  disabled={!bulkDomainId || selectedIds.size === 0 || bulkBusy}
                  className="rounded-md bg-zinc-950 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  File {selectedIds.size || ""}
                </button>
                <input
                  type="date"
                  value={bulkScheduleDate}
                  onChange={(e) => setBulkScheduleDate(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  onClick={handleBulkSchedule}
                  disabled={!bulkScheduleDate || selectedIds.size === 0 || bulkBusy}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Schedule {selectedIds.size || ""}
                </button>
                <button
                  onClick={handleBulkComplete}
                  disabled={selectedIds.size === 0 || bulkBusy}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Complete {selectedIds.size || ""}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || bulkBusy}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-sm font-medium text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400"
                >
                  Delete {selectedIds.size || ""}
                </button>
                {bulkBusy && <span className="text-sm text-zinc-500">Working...</span>}
              </div>
            )}

            {inboxTasks.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nothing unprocessed — inbox is clear.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-zinc-500">
                  💡 GTD&apos;s two-minute rule: if something here takes less than two minutes,
                  just do it now instead of filing it.
                </p>
                <ul className="space-y-2">
                {selectMode
                  ? inboxTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        domains={domains}
                        projects={projects}
                        onToggleDone={toggleDone}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onConvertToProject={handleConvertToProject}
                        onConvertToRecurring={handleConvertToRecurring}
                        onConvertToKnowledgeItem={handleConvertToKnowledgeItem}
                        selectable
                        selected={selectedIds.has(task.id)}
                        onSelectChange={(checked) => toggleSelected(task.id, checked)}
                      />
                    ))
                  : renderGroupedTaskRows(inboxTasks, {
                      domains,
                      projects,
                      onToggleDone: toggleDone,
                      onUpdate: handleUpdate,
                      onDelete: handleDelete,
                      onConvertToProject: handleConvertToProject,
                      onConvertToRecurring: handleConvertToRecurring,
                      onConvertToKnowledgeItem: handleConvertToKnowledgeItem,
                    })}
                </ul>
              </>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              By domain {processedTasks.length > 0 && `(${processedTasks.length})`}
            </h2>
            {domains.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No domains yet —{" "}
                <Link href="/domains" className="underline hover:text-zinc-950 dark:hover:text-zinc-50">
                  create one
                </Link>{" "}
                to start organizing tasks.
              </p>
            ) : (
              <div className="space-y-6">
                {domains.map((domain) => {
                  const domainProjects = projects.filter((p) => p.domain_id === domain.id);
                  const domainTasks = processedTasks.filter((t) => t.domain_id === domain.id);
                  const unfiledDomainTasks = domainTasks.filter((t) => !t.project_id);

                  return (
                    <div key={domain.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: domain.color }}
                        />
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {domain.name}
                        </h3>
                        {domainTasks.length > 0 && (
                          <span className="text-xs text-zinc-500">({domainTasks.length})</span>
                        )}
                        <Link
                          href={`/tasks?domain=${domain.id}`}
                          aria-label="View all tasks"
                          title="View all tasks"
                          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 6h11M9 12h11M9 18h11" />
                            <path d="M4 6h.01M4 12h.01M4 18h.01" />
                          </svg>
                        </Link>
                      </div>

                      {domainProjects.length === 0 && domainTasks.length === 0 ? (
                        <p className="ml-[1.375rem] text-sm text-zinc-500">
                          No projects or tasks yet.
                        </p>
                      ) : (
                        <div className="ml-[1.375rem] space-y-4">
                          {domainProjects.map((project) => {
                            const projectTasks = domainTasks.filter(
                              (t) => t.project_id === project.id,
                            );
                            return (
                              <div key={project.id}>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                  {project.name}
                                </p>
                                {projectTasks.length === 0 ? (
                                  <p className="text-sm text-zinc-500">No tasks yet.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {renderGroupedTaskRows(projectTasks, {
                                      domains,
                                      projects,
                                      onToggleDone: toggleDone,
                                      onUpdate: handleUpdate,
                                      onDelete: handleDelete,
                                      onConvertToProject: handleConvertToProject,
                                      onConvertToRecurring: handleConvertToRecurring,
                                      onConvertToKnowledgeItem: handleConvertToKnowledgeItem,
                                    })}
                                  </ul>
                                )}
                              </div>
                            );
                          })}

                          {unfiledDomainTasks.length > 0 && (
                            <div>
                              {domainProjects.length > 0 && (
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                  No project
                                </p>
                              )}
                              <ul className="space-y-2">
                                {renderGroupedTaskRows(unfiledDomainTasks, {
                                  domains,
                                  projects,
                                  onToggleDone: toggleDone,
                                  onUpdate: handleUpdate,
                                  onDelete: handleDelete,
                                  onConvertToProject: handleConvertToProject,
                                  onConvertToRecurring: handleConvertToRecurring,
                                  onConvertToKnowledgeItem: handleConvertToKnowledgeItem,
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
