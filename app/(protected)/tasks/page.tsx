"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TaskRow, {
  type Task,
  type TaskDomain,
  type TaskProject,
  type TaskPriority,
} from "@/components/task-row";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import RecurrenceFields from "@/components/recurrence-fields";
import { renderGroupedTaskRows } from "@/components/recurring-task-group";
import { describeRecurrence, type RecurrenceType } from "@/lib/recurring-tasks/types";

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];

type ProjectWithDomain = TaskProject & { domain_id: string | null };

type RecurringTemplate = {
  id: string;
  title: string;
  notes: string | null;
  link: string | null;
  domain_id: string | null;
  project_id: string | null;
  priority: TaskPriority;
  recurrence_type: RecurrenceType;
  days_of_week: number[] | null;
  day_of_month: number | null;
  interval_days: number | null;
  horizon_count: number;
  active: boolean;
};

export default function TasksPage() {
  const searchParams = useSearchParams();
  const domainFilter = searchParams.get("domain");
  const projectFilter = searchParams.get("project");
  const searchQuery = searchParams.get("q");

  const [domains, setDomains] = useState<TaskDomain[]>([]);
  const [projects, setProjects] = useState<ProjectWithDomain[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [domainId, setDomainId] = useState(domainFilter ?? "");
  const [projectId, setProjectId] = useState(projectFilter ?? "");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [image, setImage] = useState<File | null>(null);

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("weekly");
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([]);
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(1);
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(7);
  const [recurringTemplates, setRecurringTemplates] = useState<RecurringTemplate[]>([]);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editDomainId, setEditDomainId] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("none");
  const [editHorizonCount, setEditHorizonCount] = useState(12);
  const [editRecurrenceType, setEditRecurrenceType] = useState<RecurrenceType>("weekly");
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<number[]>([]);
  const [editDayOfMonth, setEditDayOfMonth] = useState(1);
  const [editIntervalDays, setEditIntervalDays] = useState(7);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDomainId, setBulkDomainId] = useState("");
  const [bulkFiling, setBulkFiling] = useState(false);

  // Re-sync the create form's domain/project whenever the URL filter
  // changes — e.g. clicking from one domain's task view to another reuses
  // this same component instance, so the useState initializers above only
  // run once and would otherwise leave the form pointed at the old filter.
  // Adjusting state during render (not in an effect) is React's documented
  // pattern for this: https://react.dev/learn/you-might-not-need-an-effect
  const [prevDomainFilter, setPrevDomainFilter] = useState(domainFilter);
  if (domainFilter !== prevDomainFilter) {
    setPrevDomainFilter(domainFilter);
    setDomainId(domainFilter ?? "");
  }
  const [prevProjectFilter, setPrevProjectFilter] = useState(projectFilter);
  if (projectFilter !== prevProjectFilter) {
    setPrevProjectFilter(projectFilter);
    setProjectId(projectFilter ?? "");
  }

  async function loadAll() {
    try {
      const [domainsRes, projectsRes, tasksRes] = await Promise.all([
        fetch("/api/domains"),
        fetch("/api/projects"),
        fetch("/api/tasks"),
      ]);
      if (!domainsRes.ok || !projectsRes.ok || !tasksRes.ok) {
        throw new Error("Failed to load tasks");
      }
      setDomains(await domainsRes.json());
      setProjects(await projectsRes.json());
      setTasks(await tasksRes.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function loadRecurringTemplates() {
    const res = await fetch("/api/recurring-task-templates");
    if (res.ok) setRecurringTemplates(await res.json());
  }

  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };

    Promise.all([
      fetch("/api/domains", opts),
      fetch("/api/projects", opts),
      fetch("/api/tasks", opts),
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

    fetch("/api/recurring-task-templates", opts)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: RecurringTemplate[]) => setRecurringTemplates(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });

    return () => controller.abort();
  }, []);

  useRealtimeRefresh(["tasks", "domains", "projects"], () => loadAll());
  useRealtimeRefresh(["recurring_task_templates"], () => loadRecurringTemplates());

  function resetCreateForm() {
    setTitle("");
    setLink("");
    setNotes("");
    setDomainId("");
    setProjectId("");
    setPriority("none");
    setDueDate("");
    setScheduledDate("");
    setImage(null);
    setIsRecurring(false);
    setRecurrenceType("weekly");
    setRecurrenceDaysOfWeek([]);
    setRecurrenceDayOfMonth(1);
    setRecurrenceIntervalDays(7);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;

    if (isRecurring) {
      if (recurrenceType === "weekly" && recurrenceDaysOfWeek.length === 0) {
        setError("Pick at least one day for a weekly recurring task.");
        return;
      }

      const res = await fetch("/api/recurring-task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          link: link || undefined,
          notes: notes || undefined,
          domain_id: domainId || null,
          project_id: projectId || null,
          priority,
          recurrence_type: recurrenceType,
          days_of_week: recurrenceType === "weekly" ? recurrenceDaysOfWeek : undefined,
          day_of_month: recurrenceType === "monthly" ? recurrenceDayOfMonth : undefined,
          interval_days: recurrenceType === "interval" ? recurrenceIntervalDays : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create recurring task");
        return;
      }

      resetCreateForm();
      await loadRecurringTemplates();
      await loadAll();
      return;
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        link: link || undefined,
        notes: notes || undefined,
        domain_id: domainId || null,
        project_id: projectId || null,
        priority,
        due_date: dueDate || undefined,
        scheduled_date: scheduledDate || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return;
    }

    const task = await res.json();

    if (image) {
      const formData = new FormData();
      formData.append("file", image);
      await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body: formData });
    }

    resetCreateForm();
    await loadAll();
  }

  async function handleToggleTemplateActive(id: string, active: boolean) {
    const res = await fetch(`/api/recurring-task-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update recurring task");
      return;
    }
    await loadRecurringTemplates();
  }

  function startEditTemplate(t: RecurringTemplate) {
    setEditingTemplateId(t.id);
    setEditTitle(t.title);
    setEditNotes(t.notes ?? "");
    setEditLink(t.link ?? "");
    setEditDomainId(t.domain_id ?? "");
    setEditProjectId(t.project_id ?? "");
    setEditPriority(t.priority);
    setEditHorizonCount(t.horizon_count);
    setEditRecurrenceType(t.recurrence_type);
    setEditDaysOfWeek(t.days_of_week ?? []);
    setEditDayOfMonth(t.day_of_month ?? 1);
    setEditIntervalDays(t.interval_days ?? 7);
  }

  function cancelEditTemplate() {
    setEditingTemplateId(null);
  }

  async function handleUpdateTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingTemplateId || !editTitle.trim()) return;

    if (editRecurrenceType === "weekly" && editDaysOfWeek.length === 0) {
      setError("Pick at least one day for a weekly recurring task.");
      return;
    }

    const res = await fetch(`/api/recurring-task-templates/${editingTemplateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        notes: editNotes || null,
        link: editLink || null,
        domain_id: editDomainId || null,
        project_id: editProjectId || null,
        priority: editPriority,
        horizon_count: editHorizonCount,
        recurrence_type: editRecurrenceType,
        days_of_week: editRecurrenceType === "weekly" ? editDaysOfWeek : undefined,
        day_of_month: editRecurrenceType === "monthly" ? editDayOfMonth : undefined,
        interval_days: editRecurrenceType === "interval" ? editIntervalDays : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update recurring task");
      return;
    }

    setEditingTemplateId(null);
    await loadRecurringTemplates();
  }

  async function handleDeleteTemplate(id: string) {
    if (
      !confirm(
        "Delete this recurring task? Already-generated occurrences stay as regular tasks — only future generation stops.",
      )
    )
      return;
    const res = await fetch(`/api/recurring-task-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete recurring task");
      return;
    }
    await loadRecurringTemplates();
  }

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

  async function handleDelete(id: string, scope?: "skip" | "following") {
    // Recurring tasks route through TaskRow's own "Skip this one" / "This +
    // future" picker, which is itself the confirmation step — a plain
    // (non-recurring) delete never shows that picker and still needs one.
    if (!scope && !confirm("Move this task to trash? You can restore it within 30 days.")) return;

    const url = scope === "following" ? `/api/tasks/${id}?scope=following` : `/api/tasks/${id}`;
    const res = await fetch(url, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete task");
      return;
    }

    await loadAll();
    if (scope === "following") await loadRecurringTemplates();
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

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
    setBulkDomainId("");
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleBulkFile() {
    if (!bulkDomainId || selectedIds.size === 0) return;

    setBulkFiling(true);
    const results = await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain_id: bulkDomainId }),
        }),
      ),
    );
    setBulkFiling(false);

    if (results.some((res) => !res.ok)) {
      setError("Some tasks couldn't be filed — try again.");
    }

    setSelectedIds(new Set());
    setBulkDomainId("");
    setSelectMode(false);
    await loadAll();
  }

  const inboxTasks = tasks.filter((t) => !t.domain_id && t.status !== "done");
  const processedTasks = tasks.filter((t) => t.domain_id && t.status !== "done");

  const filteredTasks = searchQuery
    ? tasks.filter(
        (t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()) && t.status !== "done",
      )
    : domainFilter
      ? tasks.filter((t) => t.domain_id === domainFilter && t.status !== "done")
      : projectFilter
        ? tasks.filter((t) => t.project_id === projectFilter && t.status !== "done")
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

      <form
        onSubmit={handleCreate}
        className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            New task
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call the dentist"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="link"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Link (optional)
          </label>
          <input
            id="link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="domain"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Domain
            </label>
            <select
              id="domain"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Inbox</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="project"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Project
            </label>
            <select
              id="project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Priority
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {!isRecurring && (
            <>
              <div>
                <label
                  htmlFor="due_date"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Due date
                </label>
                <input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDueDate(value);
                    if (value && !scheduledDate) setScheduledDate(value);
                  }}
                  className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <label
                  htmlFor="scheduled_date"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Scheduled
                </label>
                <input
                  id="scheduled_date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setScheduledDate(value);
                    if (value && !dueDate) setDueDate(value);
                  }}
                  className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <label
                aria-label="Add image"
                title={image ? image.name : "Add image"}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10.5" r="1.5" />
                  <path d="M3 16l5-4 4 3 4-3 5 4" />
                  <path d="M15 6h4M17 4v4" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {image && (
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  title="Remove image"
                  className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
                >
                  {image.name} ✕
                </button>
              )}
            </>
          )}
          <button
            type="submit"
            className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Add
          </button>
        </div>

        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            Make this recurring
          </label>

          {isRecurring && (
            <RecurrenceFields
              recurrenceType={recurrenceType}
              onRecurrenceTypeChange={setRecurrenceType}
              daysOfWeek={recurrenceDaysOfWeek}
              onToggleDay={(day) =>
                setRecurrenceDaysOfWeek((prev) =>
                  prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
                )
              }
              dayOfMonth={recurrenceDayOfMonth}
              onDayOfMonthChange={setRecurrenceDayOfMonth}
              intervalDays={recurrenceIntervalDays}
              onIntervalDaysChange={setRecurrenceIntervalDays}
            />
          )}
        </div>
      </form>

      {recurringTemplates.length > 0 && (
        <details className="mb-8 group">
          <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
            Recurring tasks ({recurringTemplates.length})
          </summary>
          <ul className="space-y-2">
            {recurringTemplates.map((t) =>
              editingTemplateId === t.id ? (
                <li
                  key={t.id}
                  className="space-y-3 rounded-md border border-zinc-300 px-4 py-3 dark:border-zinc-700"
                >
                  <form onSubmit={handleUpdateTemplate} className="space-y-3">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title"
                      required
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <input
                      value={editLink}
                      onChange={(e) => setEditLink(e.target.value)}
                      placeholder="Link (optional)"
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <div className="flex flex-wrap items-end gap-3">
                      <select
                        value={editDomainId}
                        onChange={(e) => setEditDomainId(e.target.value)}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="">Inbox</option>
                        {domains.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editProjectId}
                        onChange={(e) => setEditProjectId(e.target.value)}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="">No project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm text-zinc-500">
                        Keep
                        <input
                          type="number"
                          min={1}
                          max={52}
                          value={editHorizonCount}
                          onChange={(e) => setEditHorizonCount(Number(e.target.value))}
                          className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        upcoming
                      </label>
                    </div>
                    <RecurrenceFields
                      recurrenceType={editRecurrenceType}
                      onRecurrenceTypeChange={setEditRecurrenceType}
                      daysOfWeek={editDaysOfWeek}
                      onToggleDay={(day) =>
                        setEditDaysOfWeek((prev) =>
                          prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
                        )
                      }
                      dayOfMonth={editDayOfMonth}
                      onDayOfMonthChange={setEditDayOfMonth}
                      intervalDays={editIntervalDays}
                      onIntervalDaysChange={setEditIntervalDays}
                    />
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditTemplate}
                        className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li
                  key={t.id}
                  className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 ${
                    t.active
                      ? "border-zinc-200 dark:border-zinc-800"
                      : "border-zinc-200 opacity-50 dark:border-zinc-800"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {t.title}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {describeRecurrence(t)} · keeps {t.horizon_count} upcoming
                      {!t.active ? " · paused" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startEditTemplate(t)}
                      className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleTemplateActive(t.id, !t.active)}
                      className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      {t.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="text-sm font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </details>
      )}

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
              {renderGroupedTaskRows(filteredTasks, {
                domains,
                projects,
                onToggleDone: toggleDone,
                onUpdate: handleUpdate,
                onDelete: handleDelete,
                onConvertToProject: handleConvertToProject,
              })}
            </ul>
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
                  disabled={!bulkDomainId || selectedIds.size === 0 || bulkFiling}
                  className="rounded-md bg-zinc-950 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {bulkFiling ? "Filing..." : `File ${selectedIds.size || ""}`}
                </button>
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
