"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { type TaskDomain, type TaskPriority, type TaskEnergy, type TaskProject } from "@/components/task-row";
import RecurrenceFields, {
  DEFAULT_RECURRENCE_PATTERN,
  type RecurrencePatternDraft,
} from "@/components/recurrence-fields";
import ContextFields from "@/components/context-fields";
import { useDomainProjectCascade } from "@/lib/hooks/use-domain-project-cascade";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { PRIORITIES } from "@/lib/tasks/constants";
import {
  describeRecurrence,
  type CompletionOffsetUnit,
  type EndsType,
  type MonthClamp,
  type RecurrenceType,
} from "@/lib/recurring-tasks/types";

export type RecurringTemplate = {
  id: string;
  title: string;
  notes: string | null;
  link: string | null;
  domain_id: string | null;
  project_id: string | null;
  priority: TaskPriority;
  context: string | null;
  estimated_minutes: number | null;
  energy_level: TaskEnergy | null;
  recurrence_type: RecurrenceType;
  days_of_week: number[] | null;
  day_of_month: number | null;
  interval_days: number | null;
  month_of_year: number | null;
  week_of_month: number | null;
  weekday_of_month: number | null;
  month_clamp: MonthClamp;
  completion_offset_count: number | null;
  completion_offset_unit: CompletionOffsetUnit | null;
  ends_type: EndsType;
  ends_date: string | null;
  ends_count: number | null;
  horizon_count: number;
  active: boolean;
};

type RecurringTemplatesSectionProps = {
  recurringTemplates: RecurringTemplate[];
  domains: TaskDomain[];
  projects: TaskProject[];
  editTemplateId: string | null;
  setError: (message: string) => void;
  loadRecurringTemplates: () => Promise<void>;
};

export default function RecurringTemplatesSection({
  recurringTemplates,
  domains,
  projects,
  editTemplateId,
  setError,
  loadRecurringTemplates,
}: RecurringTemplatesSectionProps) {
  const recurringDetailsRef = useRef<HTMLDetailsElement>(null);
  const openedEditTemplateRef = useRef(false);
  const { confirm } = useConfirmDialog();

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLink, setEditLink] = useState("");
  const {
    domainId: editDomainId,
    projectId: editProjectId,
    setDomainId: setEditDomainId,
    setProjectId: setEditProjectId,
    filteredProjects: editFilteredProjects,
    reset: resetEditDomainProject,
  } = useDomainProjectCascade(projects);
  const [editPriority, setEditPriority] = useState<TaskPriority>("none");
  const [editContext, setEditContext] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [editEnergyLevel, setEditEnergyLevel] = useState<TaskEnergy | "">("");
  const [editHorizonCount, setEditHorizonCount] = useState(12);
  const [editPattern, setEditPattern] = useState<RecurrencePatternDraft>(DEFAULT_RECURRENCE_PATTERN);

  // Deep-link from a recurring task's own edit form ("Edit the recurring
  // pattern for this series") — auto-opens the otherwise-collapsed
  // "Recurring tasks" list and jumps straight into editing the right one,
  // instead of leaving the user to find it themselves.
  useEffect(() => {
    if (!editTemplateId || openedEditTemplateRef.current) return;
    const template = recurringTemplates.find((t) => t.id === editTemplateId);
    if (!template) return;

    openedEditTemplateRef.current = true;
    if (recurringDetailsRef.current) recurringDetailsRef.current.open = true;
    startEditTemplate(template);
    recurringDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // startEditTemplate only ever calls stable setState setters (including
    // the memoized domain/project cascade setters) — safe to omit; adding
    // it would re-run this on every render since it's redefined each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTemplateId, recurringTemplates]);

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
    resetEditDomainProject(t.domain_id ?? "", t.project_id ?? "");
    setEditPriority(t.priority);
    setEditContext(t.context ?? "");
    setEditEstimatedMinutes(t.estimated_minutes != null ? String(t.estimated_minutes) : "");
    setEditEnergyLevel(t.energy_level ?? "");
    setEditHorizonCount(t.horizon_count);
    setEditPattern({
      recurrence_type: t.recurrence_type,
      days_of_week: t.days_of_week ?? [],
      day_of_month: t.day_of_month ?? 1,
      interval_days: t.interval_days ?? 7,
      month_of_year: t.month_of_year ?? 1,
      week_of_month: t.week_of_month ?? 1,
      weekday_of_month: t.weekday_of_month ?? 1,
      month_clamp: t.month_clamp ?? "clamp",
      completion_offset_count: t.completion_offset_count ?? 1,
      completion_offset_unit: t.completion_offset_unit ?? "day",
      ends_type: t.ends_type ?? "never",
      ends_date: t.ends_date ?? "",
      ends_count: t.ends_count ?? 1,
    });
  }

  function cancelEditTemplate() {
    setEditingTemplateId(null);
  }

  async function handleUpdateTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingTemplateId || !editTitle.trim()) return;

    if (editPattern.recurrence_type === "weekly" && editPattern.days_of_week.length === 0) {
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
        context: editContext.trim() || null,
        estimated_minutes: editEstimatedMinutes ? Number(editEstimatedMinutes) : null,
        energy_level: editEnergyLevel || null,
        horizon_count: editHorizonCount,
        ...editPattern,
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
      !(await confirm({
        message:
          "Delete this recurring task? Already-generated occurrences stay as regular tasks — only future generation stops.",
        confirmLabel: "Delete",
        danger: true,
      }))
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

  if (recurringTemplates.length === 0) return null;

  return (
    <details ref={recurringDetailsRef} className="mb-8 group">
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
                    {editFilteredProjects.map((p) => (
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
                  {editPattern.recurrence_type !== "completion" && (
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
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ContextFields
                    context={editContext}
                    onContextChange={setEditContext}
                    estimatedMinutes={editEstimatedMinutes}
                    onEstimatedMinutesChange={setEditEstimatedMinutes}
                    energyLevel={editEnergyLevel}
                    onEnergyLevelChange={setEditEnergyLevel}
                  />
                </div>
                <RecurrenceFields
                  pattern={editPattern}
                  onChange={(updates) => setEditPattern((prev) => ({ ...prev, ...updates }))}
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
  );
}
