"use client";

import { useEffect, useState } from "react";
import SmartListHeader from "@/components/smart-list-header";
import { renderGroupedTaskRows } from "@/components/recurring-task-group";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { todayLocal } from "@/lib/date";

type ContextRow = { id: string; name: string };

// GTD context lists (@Phone, @Errands, @Computer...) as a browsable smart
// list — the complement to Do Now. Do Now answers "given where I am right
// now, pick ONE thing"; this answers "show me the whole @Errands list
// before I leave the house". Same actionable-now inventory as Do Now
// (not done, not Someday, not Waiting For, not scheduled for the future),
// sliced by tasks.context instead of filtered by three criteria at once.
export default function ContextsPage() {
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
  } = useTaskList({ done: false });

  const [contextRows, setContextRows] = useState<ContextRow[]>([]);
  const [contextsError, setContextsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | "all" | "none">("all");

  async function loadContexts() {
    try {
      const res = await fetch("/api/contexts");
      if (!res.ok) throw new Error("Failed to load contexts");
      setContextRows(await res.json());
      setContextsError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setContextsError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/contexts", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load contexts"))))
      .then((data: ContextRow[]) => setContextRows(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setContextsError(err instanceof Error ? err.message : "Something went wrong");
      });

    return () => controller.abort();
  }, []);

  useRealtimeRefresh(["contexts"], () => loadContexts());

  const today = todayLocal();

  // Same actionable-now definition as Do Now — keep the two in agreement.
  const actionableTasks = tasks.filter(
    (t) =>
      t.status !== "done" &&
      !t.someday &&
      !t.waiting_for &&
      (!t.scheduled_date || t.scheduled_date <= today),
  );

  // The context universe: the standalone contexts list (so an empty context
  // is still visible and pickable), plus any free-text value already in use
  // on a task that isn't in the list.
  const inUse = new Set(
    actionableTasks.map((t) => t.context).filter((c): c is string => !!c),
  );
  const contextNames = [...new Set([...contextRows.map((c) => c.name), ...inUse])].sort(
    (a, b) => a.localeCompare(b),
  );

  const byContext = new Map<string, typeof actionableTasks>();
  for (const name of contextNames) byContext.set(name, []);
  const noContext: typeof actionableTasks = [];
  for (const t of actionableTasks) {
    if (t.context && byContext.has(t.context)) byContext.get(t.context)!.push(t);
    else noContext.push(t);
  }

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

  const pillBase =
    "rounded-full border px-3 py-1 text-sm transition-colors";
  const pillOff =
    "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800";
  const pillOn =
    "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900";

  const visibleSections =
    selected === "all"
      ? contextNames.filter((name) => (byContext.get(name)?.length ?? 0) > 0)
      : selected === "none"
        ? []
        : [selected];

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="@" color="#65a30d" title="Contexts" count={actionableTasks.length} />

      <p className="mb-4 text-xs text-zinc-500">
        Next actions by where (and how) you can do them. Pick a list before you pick a task —
        &ldquo;I&rsquo;m at the phone, what are all my calls?&rdquo; Manage the context list in
        Settings.
      </p>

      {(error || contextsError) && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error ?? contextsError}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected("all")}
          className={`${pillBase} ${selected === "all" ? pillOn : pillOff}`}
        >
          All
        </button>
        {contextNames.map((name) => {
          const count = byContext.get(name)?.length ?? 0;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              className={`${pillBase} ${selected === name ? pillOn : pillOff}`}
            >
              @{name}
              {count > 0 && <span className="ml-1.5 opacity-60">{count}</span>}
            </button>
          );
        })}
        {noContext.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected("none")}
            className={`${pillBase} ${selected === "none" ? pillOn : pillOff}`}
          >
            No context
            <span className="ml-1.5 opacity-60">{noContext.length}</span>
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : actionableTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing actionable right now — check the Inbox, or enjoy the clear runway.
        </p>
      ) : (
        <div className="space-y-8">
          {visibleSections.map((name) => {
            const list = byContext.get(name) ?? [];
            return (
              <section key={name}>
                <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  @{name}
                  <span className="ml-2 font-normal text-zinc-400">{list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Nothing on this list right now.
                  </p>
                ) : (
                  <ul className="space-y-2">{renderGroupedTaskRows(list, rowProps)}</ul>
                )}
              </section>
            );
          })}

          {(selected === "all" || selected === "none") && noContext.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                No context
                <span className="ml-2 font-normal text-zinc-400">{noContext.length}</span>
              </h2>
              <p className="mb-2 text-xs text-zinc-500">
                Invisible to context filtering until tagged — add one from each task&rsquo;s edit
                form.
              </p>
              <ul className="space-y-2">{renderGroupedTaskRows(noContext, rowProps)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
