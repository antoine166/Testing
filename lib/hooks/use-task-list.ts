"use client";

import { useEffect, useState } from "react";
import type { Task, TaskDomain, TaskProject } from "@/components/task-row";
import type { RecurrencePatternDraft } from "@/components/recurrence-fields";
import { markLocalRefresh, useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import {
  knowledgeConversionToast,
  projectConversionToast,
  recurringConversionToast,
  taskTrashedToast,
  useToast,
} from "@/components/toast";

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
export function useTaskList(options?: { done?: boolean; onAfterRefresh?: () => void | Promise<void> }) {
  const [domains, setDomains] = useState<TaskDomain[]>([]);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

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

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update task");
      return;
    }
    await loadAll();
  }

  async function toggleDone(task: Task) {
    await handleUpdate(task.id, { status: task.status === "done" ? "todo" : "done" });
  }

  async function handleDelete(id: string, scope?: "skip" | "following", skipConfirm = false) {
    // Recurring tasks route through TaskRow's own "Skip this one" / "This +
    // future" picker, which is itself the confirmation step — a plain
    // (non-recurring) delete never shows that picker and still needs one.
    // The Clarify flow passes skipConfirm: its Trash button is an explicit,
    // deliberate choice within a decision flow, so a second dialog is noise.
    if (!scope && !skipConfirm && !confirm("Move this task to trash? You can restore it within 30 days.")) return;
    const url = scope === "following" ? `/api/tasks/${id}?scope=following` : `/api/tasks/${id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete task");
      return;
    }
    if (scope === "following") {
      // A whole series went — single-task Undo can't bring it back, so
      // point at the Trash page instead.
      showToast("Series moved to Trash", { label: "View Trash", href: "/trash" });
    } else {
      showToast(
        ...taskTrashedToast(async () => {
          const undoRes = await fetch(`/api/trash/task/${id}`, { method: "PATCH" });
          if (undoRes.ok) await loadAll();
        }),
      );
    }
    await loadAll();
  }

  async function createTask(input: Record<string, unknown>) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return null;
    }
    const created: Task = await res.json();
    await loadAll();
    return created;
  }

  async function handleConvertToProject(id: string, skipConfirm = false, domainId?: string) {
    if (
      !skipConfirm &&
      !confirm(
        "Convert this task into a project? A new project will be created with its details, and the task will move to Trash.",
      )
    )
      return null;
    // domainId lets the edit form's unsaved domain selection carry straight
    // into the conversion — without it, a domain-less task would 400
    // ("projects need a domain") until saved and re-edited.
    const res = await fetch(`/api/tasks/${id}/convert-to-project`, {
      method: "POST",
      ...(domainId
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain_id: domainId }),
          }
        : {}),
    });
    if (!res.ok) {
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

  async function handleConvertToRecurring(id: string, pattern: RecurrencePatternDraft) {
    const res = await fetch(`/api/tasks/${id}/convert-to-recurring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pattern),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to convert task to recurring");
      return;
    }
    showToast(...recurringConversionToast(await res.json()));
    await loadAll();
  }

  async function handleConvertToKnowledgeItem(id: string, skipConfirm = false) {
    if (
      !skipConfirm &&
      !confirm(
        "File this task as reference? A knowledge library item will be created from its title/notes/link, and the task will move to Trash.",
      )
    )
      return;
    const res = await fetch(`/api/tasks/${id}/convert-to-knowledge-item`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to file task as reference");
      return;
    }
    showToast(...knowledgeConversionToast(await res.json()));
    await loadAll();
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
