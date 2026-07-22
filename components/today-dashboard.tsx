"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { todayLocal } from "@/lib/date";
import { isAtRisk, isPendingToday } from "@/lib/habits/streaks";
import { postHabitLog, deleteHabitLog } from "@/lib/habits/api";
import LevelPicker from "@/components/level-picker";
import HabitRow, { type Habit, type HabitLogRow } from "@/components/habit-row";
import TaskRow, {
  type Task,
  type TaskDomain,
  type TaskProject,
  type TaskPriority,
  type TaskEnergy,
} from "@/components/task-row";
import { type Routine } from "@/components/routine-card";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import RecurrenceFields, {
  DEFAULT_RECURRENCE_PATTERN,
  type RecurrencePatternDraft,
} from "@/components/recurrence-fields";
import WaitingForFields from "@/components/waiting-for-fields";
import TaskExtraFields from "@/components/task-extra-fields";
import { useDomainProjectCascade } from "@/lib/hooks/use-domain-project-cascade";

type Checkin = {
  date: string;
  energy_level: number;
  focus_level: number;
  notes: string | null;
} | null;

type RoutineItem = {
  id: string;
  routine_id: string;
  title: string;
  duration_minutes: number | null;
  sort_order: number;
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];

function currentTimeOfDay(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

async function fetchDashboardData(today: string, opts?: RequestInit) {
  const [checkinRes, habitsRes, logsRes, tasksRes, domainsRes, projectsRes, routinesRes] =
    await Promise.all([
      fetch(`/api/checkins?date=${today}`, opts),
      fetch("/api/habits", opts),
      fetch("/api/habit-logs", opts),
      fetch("/api/tasks", opts),
      fetch("/api/domains", opts),
      fetch("/api/projects", opts),
      fetch("/api/routines", opts),
    ]);

  if (
    !checkinRes.ok ||
    !habitsRes.ok ||
    !logsRes.ok ||
    !tasksRes.ok ||
    !domainsRes.ok ||
    !projectsRes.ok ||
    !routinesRes.ok
  ) {
    throw new Error("Failed to load today's data");
  }

  const [checkin, habits, logs, tasks, domains, projects, routines] = await Promise.all([
    checkinRes.json(),
    habitsRes.json(),
    logsRes.json(),
    tasksRes.json(),
    domainsRes.json(),
    projectsRes.json(),
    routinesRes.json(),
  ]);

  return { checkin, habits, logs, tasks, domains, projects, routines };
}

export default function TodayDashboard() {
  const today = todayLocal();

  const [checkin, setCheckin] = useState<Checkin>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLogRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [domains, setDomains] = useState<TaskDomain[]>([]);
  const [projects, setProjects] = useState<TaskProject[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineItems, setRoutineItems] = useState<Record<string, RoutineItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const [savingCheckin, setSavingCheckin] = useState(false);

  const [captureMode, setCaptureMode] = useState<"task" | "project">("task");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskLink, setNewTaskLink] = useState("");
  const [newTaskNotes, setNewTaskNotes] = useState("");
  const {
    domainId: newTaskDomainId,
    projectId: newTaskProjectId,
    setDomainId: setNewTaskDomainId,
    setProjectId: setNewTaskProjectId,
    filteredProjects: newTaskFilteredProjects,
    reset: resetNewTaskDomainProject,
  } = useDomainProjectCascade(projects);
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("none");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskScheduledDate, setNewTaskScheduledDate] = useState(today);
  const [newTaskImage, setNewTaskImage] = useState<File | null>(null);
  const [newTaskWaitingFor, setNewTaskWaitingFor] = useState(false);
  const [newTaskWaitingOn, setNewTaskWaitingOn] = useState("");
  const [newTaskFollowUpDate, setNewTaskFollowUpDate] = useState("");
  const [newTaskSomeday, setNewTaskSomeday] = useState(false);
  const [newTaskRevisitDate, setNewTaskRevisitDate] = useState("");
  const [newTaskContext, setNewTaskContext] = useState("");
  const [newTaskEstimatedMinutes, setNewTaskEstimatedMinutes] = useState("");
  const [newTaskEnergyLevel, setNewTaskEnergyLevel] = useState<TaskEnergy | "">("");
  const [addingTask, setAddingTask] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePatternDraft>(DEFAULT_RECURRENCE_PATTERN);

  async function loadAll() {
    try {
      const data = await fetchDashboardData(today);
      setCheckin(data.checkin);
      setHabits(data.habits);
      setLogs(data.logs);
      setTasks(data.tasks);
      setDomains(data.domains);
      setProjects(data.projects);
      setRoutines(data.routines);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    fetchDashboardData(today, { signal: controller.signal })
      .then((data) => {
        setCheckin(data.checkin);
        setHabits(data.habits);
        setLogs(data.logs);
        setTasks(data.tasks);
        setDomains(data.domains);
        setProjects(data.projects);
        setRoutines(data.routines);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [today]);

  useRealtimeRefresh(
    [
      "daily_checkins",
      "habits",
      "habit_logs",
      "tasks",
      "domains",
      "projects",
      "routines",
      "routine_items",
    ],
    () => loadAll(),
  );

  useEffect(() => {
    const controller = new AbortController();
    const relevant = routines.filter(
      (r) => r.active && (r.time_of_day === currentTimeOfDay() || r.time_of_day === "custom"),
    );

    if (relevant.length === 0) return;

    Promise.all(
      relevant.map((r) =>
        fetch(`/api/routines/${r.id}/items`, { signal: controller.signal }).then((res) =>
          res.ok ? res.json() : [],
        ),
      ),
    )
      .then((results: RoutineItem[][]) => {
        const byRoutine: Record<string, RoutineItem[]> = {};
        relevant.forEach((r, i) => {
          byRoutine[r.id] = results[i];
        });
        setRoutineItems(byRoutine);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [routines]);

  async function handleSaveCheckin() {
    if (!energyLevel || !focusLevel) {
      setError("Pick an energy and focus level");
      return;
    }

    setSavingCheckin(true);
    setError(null);

    const res = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        energy_level: energyLevel,
        focus_level: focusLevel,
      }),
    });

    setSavingCheckin(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save check-in");
      return;
    }

    await loadAll();
  }

  async function addHabitLog(habit: Habit, date: string) {
    const result = await postHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadAll();
  }

  async function removeHabitLog(habit: Habit, date: string) {
    const result = await deleteHabitLog(habit.id, date);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadAll();
  }

  async function toggleHabit(habit: Habit, date: string, loggedOnDate: boolean) {
    if (loggedOnDate) {
      await removeHabitLog(habit, date);
    } else {
      await addHabitLog(habit, date);
    }
  }

  async function handleUpdateHabit(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/habits/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update habit");
      return;
    }

    await loadAll();
  }

  async function handleDeleteHabit(id: string) {
    if (!confirm("Move this habit to trash? You can restore it, with its log history, within 30 days.")) return;

    const res = await fetch(`/api/habits/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to delete habit");
      return;
    }

    await loadAll();
  }

  async function handleUpdateTask(id: string, updates: Record<string, unknown>) {
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

  async function toggleTask(task: Task) {
    await handleUpdateTask(task.id, {
      status: task.status === "done" ? "todo" : "done",
    });
  }

  async function handleDeleteTask(id: string, scope?: "skip" | "following") {
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
  }

  async function handleConvertTaskToProject(id: string) {
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

  async function handleConvertTaskToRecurring(id: string, pattern: RecurrencePatternDraft) {
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
    await loadAll();
  }

  async function handleConvertTaskToKnowledgeItem(id: string) {
    if (
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
    await loadAll();
  }

  function resetCreateForm() {
    setNewTaskTitle("");
    setNewTaskLink("");
    setNewTaskNotes("");
    resetNewTaskDomainProject();
    setNewTaskPriority("none");
    setNewTaskDueDate("");
    setNewTaskScheduledDate(today);
    setNewTaskImage(null);
    setNewTaskWaitingFor(false);
    setNewTaskWaitingOn("");
    setNewTaskFollowUpDate("");
    setNewTaskSomeday(false);
    setNewTaskRevisitDate("");
    setNewTaskContext("");
    setNewTaskEstimatedMinutes("");
    setNewTaskEnergyLevel("");
    setIsRecurring(false);
    setRecurrencePattern(DEFAULT_RECURRENCE_PATTERN);
  }

  async function handleCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newTaskTitle.trim() || addingTask) return;
    setAddingTask(true);

    if (isRecurring) {
      if (recurrencePattern.recurrence_type === "weekly" && recurrencePattern.days_of_week.length === 0) {
        setAddingTask(false);
        setError("Pick at least one day for a weekly recurring task.");
        return;
      }

      const res = await fetch("/api/recurring-task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle,
          link: newTaskLink || undefined,
          notes: newTaskNotes || undefined,
          domain_id: newTaskDomainId || null,
          project_id: newTaskProjectId || null,
          priority: newTaskPriority,
          ...recurrencePattern,
        }),
      });

      setAddingTask(false);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create recurring task");
        return;
      }

      resetCreateForm();
      await loadAll();
      return;
    }

    if (captureMode === "project") {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTaskTitle,
          description: newTaskNotes || undefined,
          link: newTaskLink || undefined,
          domain_id: newTaskDomainId || null,
          priority: newTaskPriority,
          due_date: newTaskDueDate || undefined,
          scheduled_date: newTaskScheduledDate || undefined,
        }),
      });
      setAddingTask(false);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create project");
        return;
      }
      resetCreateForm();
      await loadAll();
      return;
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTaskTitle,
        link: newTaskLink || undefined,
        notes: newTaskNotes || undefined,
        domain_id: newTaskDomainId || null,
        project_id: newTaskProjectId || null,
        priority: newTaskPriority,
        due_date: newTaskDueDate || undefined,
        scheduled_date: newTaskScheduledDate || undefined,
        waiting_for: newTaskWaitingFor || undefined,
        waiting_on: newTaskWaitingFor && newTaskWaitingOn.trim() ? newTaskWaitingOn.trim() : undefined,
        follow_up_date: newTaskWaitingFor && newTaskFollowUpDate ? newTaskFollowUpDate : undefined,
        someday: newTaskSomeday || undefined,
        revisit_date: newTaskSomeday && newTaskRevisitDate ? newTaskRevisitDate : undefined,
        context: newTaskContext.trim() || undefined,
        estimated_minutes: newTaskEstimatedMinutes ? Number(newTaskEstimatedMinutes) : undefined,
        energy_level: newTaskEnergyLevel || undefined,
      }),
    });

    if (!res.ok) {
      setAddingTask(false);
      const body = await res.json();
      setError(body.error ?? "Failed to create task");
      return;
    }

    const created = await res.json();

    if (newTaskImage) {
      const formData = new FormData();
      formData.append("file", newTaskImage);
      await fetch(`/api/tasks/${created.id}/attachments`, { method: "POST", body: formData });
    }

    setAddingTask(false);
    resetCreateForm();
    await loadAll();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  const dueRoutines = routines.filter(
    (r) => r.active && (r.time_of_day === currentTimeOfDay() || r.time_of_day === "custom"),
  );
  // Today page only ever shows habits still needing attention — done for
  // today (or, for times_per_week habits, the week's target already hit)
  // drops them from here entirely, though they stay visible on /habits.
  const dueHabits = habits
    .filter((h) => h.active && isPendingToday(h, logs.filter((l) => l.habit_id === h.id), today))
    .sort((a, b) => {
      // At-risk ones ("don't break it twice") surface first.
      const aAtRisk = isAtRisk(a, logs.filter((l) => l.habit_id === a.id), today);
      const bAtRisk = isAtRisk(b, logs.filter((l) => l.habit_id === b.id), today);
      return (bAtRisk ? 1 : 0) - (aAtRisk ? 1 : 0);
    });
  const atRiskCount = dueHabits.filter((h) =>
    isAtRisk(h, logs.filter((l) => l.habit_id === h.id), today),
  ).length;
  const todayTasks = [...tasks]
    .filter((t) => t.scheduled_date === today && t.status !== "done")
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  // GTD's hard landscape: a scheduled_time makes this a real appointment,
  // not just a day it's planned for — kept visually separate so "Today"
  // doesn't quietly become a to-do list with dates.
  const appointmentsToday = todayTasks
    .filter((t) => t.scheduled_time)
    .sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
  const plannedToday = todayTasks.filter((t) => !t.scheduled_time);
  const overdueTasks = [...tasks]
    .filter((t) => t.scheduled_date && t.scheduled_date < today && t.status !== "done")
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));
  // GTD's tickler file: a Someday/Maybe item whose date-specific trigger
  // has arrived should actually surface, not just wait to be noticed.
  const readyToRevisitCount = tasks.filter(
    (t) => t.someday && t.status !== "done" && t.revisit_date && t.revisit_date <= today,
  ).length;
  // GTD's Waiting For is only useful if it prompts an actual follow-up —
  // an explicit follow_up_date is that active nudge, surfaced the same
  // way the tickler file surfaces a Someday item that's come due.
  const readyToFollowUpCount = tasks.filter(
    (t) => t.waiting_for && t.status !== "done" && t.follow_up_date && t.follow_up_date <= today,
  ).length;

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {!checkin ? (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            How are you today?
          </h2>
          <div className="flex flex-wrap gap-6">
            <LevelPicker label="Energy" value={energyLevel} onChange={setEnergyLevel} />
            <LevelPicker label="Focus" value={focusLevel} onChange={setFocusLevel} />
          </div>
          <button
            onClick={handleSaveCheckin}
            disabled={savingCheckin}
            className="mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {savingCheckin ? "Saving..." : "Save check-in"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Checked in today — energy {checkin.energy_level}, focus{" "}
          {checkin.focus_level}.{" "}
          <Link href="/checkin" className="underline">
            Edit
          </Link>
        </p>
      )}

      {readyToRevisitCount > 0 && (
        <Link
          href="/someday"
          className="block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          🔔 {readyToRevisitCount} Someday {readyToRevisitCount === 1 ? "item" : "items"} ready to
          revisit →
        </Link>
      )}

      {readyToFollowUpCount > 0 && (
        <Link
          href="/waiting-for"
          className="block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          🔔 {readyToFollowUpCount} Waiting For {readyToFollowUpCount === 1 ? "item" : "items"} due
          for a follow-up →
        </Link>
      )}

      {dueRoutines.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Routines
          </h2>
          <div className="space-y-3">
            {dueRoutines.map((routine) => (
              <div
                key={routine.id}
                className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {routine.name}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {(routineItems[routine.id] ?? []).map((item) => (
                    <li key={item.id} className="text-xs text-zinc-500">
                      {item.title}
                      {item.duration_minutes ? ` (${item.duration_minutes} min)` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {overdueTasks.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
            Overdue ({overdueTasks.length})
          </h2>
          <ul className="inset-group">
            {overdueTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                domains={domains}
                projects={projects}
                onToggleDone={toggleTask}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onConvertToProject={handleConvertTaskToProject}
                onConvertToRecurring={handleConvertTaskToRecurring}
                onConvertToKnowledgeItem={handleConvertTaskToKnowledgeItem}
              />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Today {todayTasks.length > 0 && `(${todayTasks.length})`}
        </h2>
        <form
          onSubmit={handleCreateSubmit}
          className="mb-4 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setCaptureMode("task")}
              className={`rounded px-2 py-1 font-medium ${
                captureMode === "task"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              Task
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode("project")}
              className={`rounded px-2 py-1 font-medium ${
                captureMode === "project"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              Project
            </button>
          </div>
          <div>
            <label
              htmlFor="today-title"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {captureMode === "task" ? "New task" : "New project"}
            </label>
            <input
              id="today-title"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={captureMode === "task" ? "Add a task for today" : "New project name"}
              disabled={addingTask}
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="today-link"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Link (optional)
            </label>
            <input
              id="today-link"
              type="url"
              value={newTaskLink}
              onChange={(e) => setNewTaskLink(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="today-notes"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Notes (optional)
            </label>
            <textarea
              id="today-notes"
              value={newTaskNotes}
              onChange={(e) => setNewTaskNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="today-domain"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Domain
              </label>
              <select
                id="today-domain"
                value={newTaskDomainId}
                onChange={(e) => setNewTaskDomainId(e.target.value)}
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
            {captureMode === "task" && (
              <div>
                <label
                  htmlFor="today-project"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Project
                </label>
                <select
                  id="today-project"
                  value={newTaskProjectId}
                  onChange={(e) => setNewTaskProjectId(e.target.value)}
                  className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">No project</option>
                  {newTaskFilteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label
                htmlFor="today-priority"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Priority
              </label>
              <select
                id="today-priority"
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
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
                    htmlFor="today-due"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Due date
                  </label>
                  <input
                    id="today-due"
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewTaskDueDate(value);
                    }}
                    className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="today-scheduled"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Scheduled
                  </label>
                  <input
                    id="today-scheduled"
                    type="date"
                    value={newTaskScheduledDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewTaskScheduledDate(value);
                    }}
                    className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
                {captureMode === "task" && (
                  <WaitingForFields
                    waitingFor={newTaskWaitingFor}
                    onWaitingForChange={setNewTaskWaitingFor}
                    waitingOn={newTaskWaitingOn}
                    onWaitingOnChange={setNewTaskWaitingOn}
                    followUpDate={newTaskFollowUpDate}
                    onFollowUpDateChange={setNewTaskFollowUpDate}
                  />
                )}
                {captureMode === "task" && (
                  <TaskExtraFields
                    someday={newTaskSomeday}
                    onSomedayChange={setNewTaskSomeday}
                    revisitDate={newTaskRevisitDate}
                    onRevisitDateChange={setNewTaskRevisitDate}
                    context={newTaskContext}
                    onContextChange={setNewTaskContext}
                    estimatedMinutes={newTaskEstimatedMinutes}
                    onEstimatedMinutesChange={setNewTaskEstimatedMinutes}
                    energyLevel={newTaskEnergyLevel}
                    onEnergyLevelChange={setNewTaskEnergyLevel}
                  />
                )}
                {captureMode === "task" && (
                  <label
                    aria-label="Add image"
                    title={newTaskImage ? newTaskImage.name : "Add image"}
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
                      onChange={(e) => setNewTaskImage(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                )}
                {newTaskImage && (
                  <button
                    type="button"
                    onClick={() => setNewTaskImage(null)}
                    title="Remove image"
                    className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
                  >
                    {newTaskImage.name} ✕
                  </button>
                )}
              </>
            )}
            <button
              type="submit"
              disabled={addingTask || !newTaskTitle.trim()}
              className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Add
            </button>
          </div>
          {captureMode === "task" && (
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
                  pattern={recurrencePattern}
                  onChange={(updates) => setRecurrencePattern((prev) => ({ ...prev, ...updates }))}
                />
              )}
            </div>
          )}
        </form>
        {todayTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing scheduled for today.</p>
        ) : (
          <>
            {appointmentsToday.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Appointments
                </h3>
                <ul className="inset-group">
                  {appointmentsToday.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      domains={domains}
                      projects={projects}
                      onToggleDone={toggleTask}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                      onConvertToProject={handleConvertTaskToProject}
                      onConvertToRecurring={handleConvertTaskToRecurring}
                onConvertToKnowledgeItem={handleConvertTaskToKnowledgeItem}
                    />
                  ))}
                </ul>
              </div>
            )}
            {plannedToday.length > 0 && (
              <>
                {appointmentsToday.length > 0 && (
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Planned
                  </h3>
                )}
                <ul className="inset-group">
                  {plannedToday.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      domains={domains}
                      projects={projects}
                      onToggleDone={toggleTask}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                      onConvertToProject={handleConvertTaskToProject}
                      onConvertToRecurring={handleConvertTaskToRecurring}
                onConvertToKnowledgeItem={handleConvertTaskToKnowledgeItem}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <details open className="group">
        <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
          Habits today {dueHabits.length > 0 && `(${dueHabits.length})`}
        </summary>
        {atRiskCount > 0 && (
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-500">
            ⚠️ {atRiskCount} at risk of breaking a streak twice in a row — do these first
          </p>
        )}
        {dueHabits.length === 0 ? (
          <p className="text-sm text-zinc-500">No habits due today.</p>
        ) : (
          <ul className="space-y-2">
            {dueHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                logs={logs.filter((l) => l.habit_id === habit.id)}
                today={today}
                domains={domains}
                onToggle={toggleHabit}
                onAddLog={addHabitLog}
                onRemoveLog={removeHabitLog}
                onUpdate={handleUpdateHabit}
                onDelete={handleDeleteHabit}
              />
            ))}
          </ul>
        )}
      </details>

      <div className="pt-4 text-center">
        <Link
          href="/tasks"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          See all tasks →
        </Link>
      </div>
    </div>
  );
}
