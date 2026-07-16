"use client";

import { useEffect, useState } from "react";
import type { Task, TaskDomain, TaskProject } from "@/components/task-row";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

/** Shared fetch + CRUD wiring for the Things-style smart-list pages (Inbox, Upcoming, Anytime, Someday, Logbook). */
export function useTaskList() {
  const [domains, setDomains] = useState<TaskDomain[]>([]);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(signal?: AbortSignal) {
    try {
      const [domainsRes, projectsRes, tasksRes] = await Promise.all([
        fetch("/api/domains", { signal }),
        fetch("/api/projects", { signal }),
        fetch("/api/tasks", { signal }),
      ]);
      if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
        throw new Error("Failed to load tasks");
      }
      setDomains(await domainsRes.json());
      setProjects(await projectsRes.json());
      setTasks(await tasksRes.json());
      setError(null);
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
      fetch("/api/tasks", { signal: controller.signal }),
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
  }, []);

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

  async function handleDelete(id: string) {
    if (!confirm("Move this task to trash? You can restore it within 30 days.")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete task");
      return;
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
      return false;
    }
    await loadAll();
    return true;
  }

  async function handleConvertToProject(id: string) {
    if (
      !confirm(
        "Convert this task into a project? A new project will be created with its details, and the task will move to Trash.",
      )
    )
      return;
    const res = await fetch(`/api/tasks/${id}/convert-to-project`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to convert task to project");
      return;
    }
    await loadAll();
  }

  return {
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
  };
}
