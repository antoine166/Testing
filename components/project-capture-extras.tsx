"use client";

import { STATUSES, type ProjectStatus } from "@/lib/projects/types";

/**
 * The project-only inputs shared by every place a project can be created
 * with its full shape (All Projects page, and the Task|Project capture
 * sliders on Today / Inbox / Domains): the GTD Natural Planning fields
 * plus parent-project and status. One component, so the four surfaces
 * can't drift apart.
 *
 * Hosts keep name/description/link/domain/priority/dates themselves —
 * those inputs are shared with task capture — and merge
 * projectExtrasPayload(draft) into their POST /api/projects body.
 */
export type ProjectExtrasDraft = {
  purpose: string;
  outcome_vision: string;
  brainstorm: string;
  next_action: string;
  parent_project_id: string;
  status: ProjectStatus;
};

export const EMPTY_PROJECT_EXTRAS: ProjectExtrasDraft = {
  purpose: "",
  outcome_vision: "",
  brainstorm: "",
  next_action: "",
  parent_project_id: "",
  status: "active",
};

/** Fields for the create-project request body (next_action is separate — see createFirstTask). */
export function projectExtrasPayload(draft: ProjectExtrasDraft) {
  return {
    purpose: draft.purpose || undefined,
    outcome_vision: draft.outcome_vision || undefined,
    brainstorm: draft.brainstorm || undefined,
    parent_project_id: draft.parent_project_id || null,
    status: draft.status,
  };
}

/** The "next action becomes the project's first task" behavior, shared verbatim. */
export async function createFirstTask(
  nextAction: string,
  projectId: string,
  domainId: string | null,
) {
  if (!nextAction.trim()) return;
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: nextAction, project_id: projectId, domain_id: domainId }),
  });
}

type ParentOption = { id: string; name: string; domain_id?: string | null; status?: string; parent_project_id?: string | null };

const textarea =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

/** The collapsible "Define this project" block — full-width section. */
export function ProjectPlanningFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: ProjectExtrasDraft;
  onChange: (patch: Partial<ProjectExtrasDraft>) => void;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
        Define this project (GTD Natural Planning)
      </summary>
      <div className="mt-2 space-y-3 pl-4">
        <div>
          <label htmlFor={`${idPrefix}-purpose`} className={labelCls}>
            Purpose — why does this matter?
          </label>
          <textarea
            id={`${idPrefix}-purpose`}
            value={draft.purpose}
            onChange={(e) => onChange({ purpose: e.target.value })}
            rows={2}
            className={textarea}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-outcome`} className={labelCls}>
            Outcome vision — what does &ldquo;done&rdquo; look like?
          </label>
          <textarea
            id={`${idPrefix}-outcome`}
            value={draft.outcome_vision}
            onChange={(e) => onChange({ outcome_vision: e.target.value })}
            rows={2}
            className={textarea}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-brainstorm`} className={labelCls}>
            Brainstorm — ideas, approaches, things to consider
          </label>
          <textarea
            id={`${idPrefix}-brainstorm`}
            value={draft.brainstorm}
            onChange={(e) => onChange({ brainstorm: e.target.value })}
            rows={3}
            className={textarea}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-next-action`} className={labelCls}>
            Next action — the very next physical step
          </label>
          <input
            id={`${idPrefix}-next-action`}
            value={draft.next_action}
            onChange={(e) => onChange({ next_action: e.target.value })}
            placeholder="e.g. Draft the outline"
            className={textarea}
          />
          <p className="mt-1 text-xs text-zinc-500">
            If filled in, creates this as the first task in the project.
          </p>
        </div>
      </div>
    </details>
  );
}

/** Parent-project + status selects — drop inside the host's flex row. */
export function ProjectParentStatusFields({
  idPrefix,
  draft,
  onChange,
  projects,
  /** Called with the picked parent's domain so the host can sync its domain select. */
  onParentPicked,
}: {
  idPrefix: string;
  draft: ProjectExtrasDraft;
  onChange: (patch: Partial<ProjectExtrasDraft>) => void;
  projects: ParentOption[];
  onParentPicked?: (domainId: string | null) => void;
}) {
  // Same rule as every other picker: completed projects take no new work.
  const parentOptions = projects.filter(
    (p) => !p.parent_project_id && p.status !== "completed",
  );

  function pickParent(id: string) {
    onChange({ parent_project_id: id });
    if (id) {
      const parent = projects.find((p) => p.id === id);
      onParentPicked?.(parent?.domain_id ?? null);
    }
  }

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-parent`} className={labelCls}>
          Parent project
        </label>
        <select
          id={`${idPrefix}-parent`}
          value={draft.parent_project_id}
          onChange={(e) => pickParent(e.target.value)}
          className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">None (top-level project)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-status`} className={labelCls}>
          Status
        </label>
        <select
          id={`${idPrefix}-status`}
          value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as ProjectStatus })}
          className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
