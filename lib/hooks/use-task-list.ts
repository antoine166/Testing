"use client";

import { useEffect, useState } from "react";
import type { Task, TaskDomain, TaskProject } from "@/components/task-row";
import type { RecurrencePatternDraft } from "@/components/recurrence-fields";
import { todayLocal } from "@/lib/date";
import { markLocalRefresh, useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { markRemovalKind } from "@/components/leave-transition";
import {
  knowledgeConversionToast,
  projectConversionToast,
  recurringConversionToast,
  taskTrashedToast,
  useToast,
} from "@/components/toast";
import {
  applyTaskUpdates,
  mergeServerTask,
  needsFullReload,
  removeSeriesFrom,
  removeTask,
} from "@/lib/tasks/optimistic";

const OFFLINE_ERROR = "You're offline — that change wasn't saved.";

/**
 * Shared fetch + CRUD wiring for every page that lists tasks — the
 * Things-style smart lists (Inbox, Upcoming, Anytime, Someday, Logbook,
 * Do Now, Contexts, Waiting For, Calendar) and, since the July 2026
 * de-dup, the Today dashboard and the Tasks/Domains/Projects pages,
 * which previously carried hand-rolled copies of these handlers.
 *
 * `onAfterRefresh` runs after each full reload — for page data that
 * should stay in step with task changes (e.g. the Tasks page's
 * recurring-template list after a series delete or conversion).
 */
export function useTaskList<P extends TaskProject = TaskProject>(options?: {
  done?: boolean;
  onAfterRefresh?: () => void | Promise<void>;
}) {
  // Generic over the project row type: /api/projects always returns full
  // rows, but most pages only need the TaskProject subset — the Projects
  // page passes its richer Project type instead of re-fetching.
  const [domains, setDomains] = useState<TaskDomain[]>([]);
  const [projects, setProjects] = useState<P[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirmDialog();

  // Filter server-side: every smart list except the Logbook only ever shows
  // not-done tasks, and the Logbook only done ones — no reason to download
  // the other (ever-growing) half of the table on each load.
  const tasksUrl =
    options?.done === undefined ? "/api/tasks" : `/api/tasks?done=${options.done}`;

  async function loadAll(signal?: AbortSignal) {
    markLocalRefresh();
    try {
      const [domainsRes, projectsRes, tasksRes] = await Promise.all([
        fetch("/api/domains", { signal }),
        fetch("/api/projects", { signal }),
        fetch(tasksUrl, { signal }),
      ]);
      if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
        throw new Error("Failed to load tasks");
      }
      setDomains(await domainsRes.json());
      setProjects(await projectsRes.json());
      setTasks(await tasksRes.json());
      setError(null);
      await options?.onAfterRefresh?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch("/api/domains", { signal: controller.signal }),
      fetch("/api/projects", { signal: controller.signal }),
      fetch(tasksUrl, { signal: controller.signal }),
    ])
      .then(async ([domainsRes, projectsRes, tasksRes]) => {
        if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
          throw new Error("Failed to load tasks");
        }
        return Promise.all([domainsRes.json(), projectsRes.json(), tasksRes.json()]);
      })
      .then(([domainsData, projectsData, tasksData]) => {
        setDomains(domainsData);
        setProjects(projectsData);
        setTasks(tasksData);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [tasksUrl]);

  useRealtimeRefresh(["tasks", "domains", "projects"], () => loadAll());

  // Mutations return whether they actually happened (false = failed or
  // cancelled), so decision flows like Clarify can stop advancing past a
  // silent failure (#118) — most call sites just ignore the value.
  async function handleUpdate(id: string, updates: Record<string, unknown>): Promise<boolean> {
    // Local-first: the edit is on screen before the network round-trip.
    // markLocalRefresh() keeps the realtime echo of this write from
    // triggering a redundant full reload; on failure we put the snapshot
    // back and surface the error.
    const snapshot = tasks;
    const target = tasks.find((t) => t.id === id);
    markLocalRefresh();
    setTasks((prev) => applyTaskUpdates(prev, id, updates));

    // fetch REJECTS (rather than returning !ok) when there's no network at
    // all — without the catch, an offline edit would keep its optimistic
    // state forever with no error. Same pattern in every mutation below.
    let res: Response;
    try {
      res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // client_date: the server runs in UTC and can't know what day it
        // is locally — it uses this for waiting_since (#112 item 4).
        body: JSON.stringify({ ...updates, client_date: todayLocal() }),
      });
    } catch {
      setTasks(snapshot);
      showToast(OFFLINE_ERROR);
      return false;
    }
    markLocalRefresh();
    if (!res.ok) {
      setTasks(snapshot);
      const body = await res.json();
      setError(body.error ?? "Failed to update task");
      return false;
    }

    if (needsFullReload(target, updates)) {
      // Completing a recurring occurrence can generate the next one
      // server-side — only a reload shows it.
      await loadAll();
    } else {
      const serverTask = (await res.json()) as Task;
      setTasks((prev) => mergeServerTask(prev, serverTask));
    }
    return true;
  }

  async function toggleDone(task: Task) {
    // The row is about to leave lists that filter on done-ness — tell the
    // leave transition why (↩️ badge for un-completing, plain collapse for
    // completing, whose celebration TaskRow already owns).
    markRemovalKind(task.id, task.status === "done" ? "undone" : "done");
    return handleUpdate(task.id, { status: task.status === "done" ? "todo" : "done" });
  }

  async function handleDelete(
    id: string,
    scope?: "skip" | "following",
    skipConfirm = false,
  ): Promise<boolean> {
    // Recurring tasks route through TaskRow's own "Skip this one" / "This +
    // future" picker, which is itself the confirmation step — a plain
    // (non-recurring) delete never shows that picker and still needs one.
    // The Clarify flow passes skipConfirm: its Trash button is an explicit,
    // deliberate choice within a decision flow, so a second dialog is noise.
    if (
      !scope &&
      !skipConfirm &&
      !(await confirm({
        message: "Move this task to trash? You can restore it within 30 days.",
        confirmLabel: "Move to Trash",
        danger: true,
      }))
    )
      return false;

    // Local-first: the row disappears immediately; the snapshot comes back
    // if the server says no.
    const snapshot = tasks;
    const anchor = tasks.find((t) => t.id === id);
    markLocalRefresh();
    markRemovalKind(id, "trash");
    setTasks((prev) =>
      scope === "following" && anchor ? removeSeriesFrom(prev, anchor) : removeTask(prev, id),
    );

    const url = scope === "following" ? `/api/tasks/${id}?scope=following` : `/api/tasks/${id}`;
    let res: Response;
    try {
      res = await fetch(url, { method: "DELETE" });
    } catch {
      setTasks(snapshot);
      showToast(OFFLINE_ERROR);
      return false;
    }
    markLocalRefresh();
    if (!res.ok) {
      setTasks(snapshot);
      const body = await res.json();
      setError(body.error ?? "Failed to delete task");
      return false;
    }
    if (scope === "following") {
      // A whole series went — single-task Undo can't bring it back, so
      // point at the Trash page instead. Reload: the series delete also
      // removed its template, and onAfterRefresh keeps page extras (the
      // Tasks page's Recurring list) in step.
      showToast("Series moved to Trash", { label: "View Trash", href: "/trash" });
      await loadAll();
    } else {
      showToast(
        ...taskTrashedToast(async () => {
          try {
            const undoRes = await fetch(`/api/trash/task/${id}`, { method: "PATCH" });
            if (undoRes.ok) await loadAll();
            else showToast("Couldn't restore the task — it's still in Trash.");
          } catch {
            showToast(OFFLINE_ERROR);
          }
        }),
      );
    }
    return true;
  }

  async function createTask(input: Record<string, unknown>) {
    let res: Response;
    try {
      res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, client_date: todayLocal() }),
      });
    } catch {
      showToast(OFFLINE_ERROR);
      return null;
    }
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return null;
    }
    const created: Task = await res.json();
    // Prepend instead of reloading — matches the API's newest-first-among-
    // unsorted ordering closely enough; the next reload trues it.
    markLocalRefresh();
    setTasks((prev) => [created, ...prev]);
    return created;
  }

  async function handleConvertToProject(id: string, skipConfirm = false, domainId?: string) {
    if (
      !skipConfirm &&
      !(await confirm({
        message:
          "Convert this task into a project? A new project will be created with its details, and the task will move to Trash.",
        confirmLabel: "Convert",
      }))
    )
      return null;
    // The task leaves the list immediately; conversions still reload after
    // the server confirms, since they create entities outside this list.
    const snapshot = tasks;
    markLocalRefresh();
    markRemovalKind(id, "convert");
    setTasks((prev) => removeTask(prev, id));

    // domainId lets the edit form's unsaved domain selection carry straight
    // into the conversion — without it, a domain-less task would 400
    // ("projects need a domain") until saved and re-edited.
    let res: Response;
    try {
      res = await fetch(`/api/tasks/${id}/convert-to-project`, {
        method: "POST",
        ...(domainId
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain_id: domainId }),
            }
          : {}),
      });
    } catch {
      setTasks(snapshot);
      showToast(OFFLINE_ERROR);
      return null;
    }
    if (!res.ok) {
      setTasks(snapshot);
      const body = await res.json();
      setError(body.error ?? "Failed to convert task to project");
      return null;
    }
    // The created project, so callers (Clarify's "very next action" prompt)
    // can immediately attach a first task to it.
    const project: { id: string; name: string; domain_id: string | null } = await res.json();
    showToast(...projectConversionToast(project, domains));
    await loadAll();
    return project;
  }

  async function handleConvertToRecurring(
    id: string,
    pattern: RecurrencePatternDraft,
  ): Promise<boolean> {
    const snapshot = tasks;
    markLocalRefresh();
    markRemovalKind(id, "convert");
    setTasks((prev) => removeTask(prev, id));

    let res: Response;
    try {
      res = await fetch(`/api/tasks/${id}/convert-to-recurring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pattern),
      });
    } catch {
      setTasks(snapshot);
      showToast(OFFLINE_ERROR);
      return false;
    }
    if (!res.ok) {
      setTasks(snapshot);
      const body = await res.json();
      setError(body.error ?? "Failed to convert task to recurring");
      return false;
    }
    showToast(...recurringConversionToast(await res.json()));
    await loadAll();
    return true;
  }

  async function handleConvertToKnowledgeItem(id: string, skipConfirm = false): Promise<boolean> {
    if (
      !skipConfirm &&
      !(await confirm({
        message:
          "File this task as reference? A knowledge library item will be created from its title/notes/link, and the task will move to Trash.",
        confirmLabel: "File it",
      }))
    )
      return false;
    const snapshot = tasks;
    markLocalRefresh();
    markRemovalKind(id, "convert");
    setTasks((prev) => removeTask(prev, id));

    let res: Response;
    try {
      res = await fetch(`/api/tasks/${id}/convert-to-knowledge-item`, { method: "POST" });
    } catch {
      setTasks(snapshot);
      showToast(OFFLINE_ERROR);
      return false;
    }
    if (!res.ok) {
      setTasks(snapshot);
      const body = await res.json();
      setError(body.error ?? "Failed to file task as reference");
      return false;
    }
    showToast(...knowledgeConversionToast(await res.json()));
    await loadAll();
    return true;
  }

  return {
    domains,
    projects,
    tasks,
    loading,
    error,
    // For adopting pages' own non-task operations (template edits, bulk
    // actions, domain CRUD) so the page keeps a single error surface, and
    // the raw setters for local-first updates (drag reorder today,
    // optimistic mutations in #122).
    setError,
    setDomains,
    setProjects,
    setTasks,
    handleUpdate,
    toggleDone,
    handleDelete,
    createTask,
    handleConvertToProject,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
    loadAll,
  };
}
