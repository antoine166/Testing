"use client";

import { type TaskDomain } from "@/components/task-row";
import {
  PRIORITIES,
  STATUSES,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
} from "@/lib/projects/types";

// Extracted verbatim from ProjectCard's editing branch (#147 follow-up) so
// the project detail page can offer the same inline edit form without
// duplicating the JSX. Props mirror exactly what the card passed before.
export type ProjectEditFormProps = {
  project: Project;
  canBecomeSubproject: boolean;
  editName: string;
  setEditName: (value: string) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  editPurpose: string;
  setEditPurpose: (value: string) => void;
  editOutcomeVision: string;
  setEditOutcomeVision: (value: string) => void;
  editBrainstorm: string;
  setEditBrainstorm: (value: string) => void;
  editDomainId: string;
  setEditDomainId: (value: string) => void;
  editParentProjectId: string;
  selectEditParentProject: (id: string) => void;
  editStatus: ProjectStatus;
  setEditStatus: (value: ProjectStatus) => void;
  editPriority: ProjectPriority;
  setEditPriority: (value: ProjectPriority) => void;
  editDueDate: string;
  setEditDueDate: (value: string) => void;
  editScheduledDate: string;
  setEditScheduledDate: (value: string) => void;
  editLink: string;
  setEditLink: (value: string) => void;
  editReviewEveryDays: string;
  setEditReviewEveryDays: (value: string) => void;
  parentOptions: (excludeId?: string) => Project[];
  domains: TaskDomain[];
  handleUpdate: (id: string) => Promise<void>;
  setEditingId: (id: string | null) => void;
};

export default function ProjectEditForm(props: ProjectEditFormProps) {
  const {
    project, canBecomeSubproject,
    editName, setEditName, editDescription, setEditDescription,
    editPurpose, setEditPurpose, editOutcomeVision, setEditOutcomeVision,
    editBrainstorm, setEditBrainstorm, editDomainId, setEditDomainId,
    editParentProjectId, selectEditParentProject, editStatus, setEditStatus,
    editPriority, setEditPriority, editDueDate, setEditDueDate,
    editScheduledDate, setEditScheduledDate, editLink, setEditLink,
    editReviewEveryDays, setEditReviewEveryDays,
    parentOptions, domains, handleUpdate, setEditingId,
  } = props;

  return (
    <div className="space-y-2">
      <input
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <textarea
        value={editDescription}
        onChange={(e) => setEditDescription(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
          GTD Natural Planning
        </summary>
        <div className="mt-2 space-y-2 pl-4">
          <textarea
            value={editPurpose}
            onChange={(e) => setEditPurpose(e.target.value)}
            placeholder="Purpose — why does this matter?"
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            value={editOutcomeVision}
            onChange={(e) => setEditOutcomeVision(e.target.value)}
            placeholder="Outcome vision — what does &quot;done&quot; look like?"
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            value={editBrainstorm}
            onChange={(e) => setEditBrainstorm(e.target.value)}
            placeholder="Brainstorm — ideas, approaches, things to consider"
            rows={3}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </details>
      <input
        type="url"
        value={editLink}
        onChange={(e) => setEditLink(e.target.value)}
        placeholder="Link (optional)"
        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {/* Domain before parent, matching the create form (Antoine's call). */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={editDomainId}
          disabled={!!editParentProjectId}
          onChange={(e) => setEditDomainId(e.target.value)}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">No domain</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={editParentProjectId}
          disabled={!canBecomeSubproject}
          onChange={(e) => selectEditParentProject(e.target.value)}
          title={
            canBecomeSubproject
              ? undefined
              : "This project has its own subprojects, so it can't become a subproject itself."
          }
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">None (top-level project)</option>
          {parentOptions(project.id).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={editStatus}
          onChange={(e) =>
            setEditStatus(e.target.value as ProjectStatus)
          }
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={editPriority}
          onChange={(e) => setEditPriority(e.target.value as ProjectPriority)}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={editDueDate}
          onChange={(e) => {
            const value = e.target.value;
            setEditDueDate(value);
          }}
          title="Due date"
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="date"
          value={editScheduledDate}
          onChange={(e) => {
            const value = e.target.value;
            setEditScheduledDate(value);
          }}
          title="Scheduled date"
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <label
          className="flex items-center gap-1 text-xs text-zinc-500"
          title="How often this project needs a look in the Weekly Review. Blank = every review."
        >
          Review every
          <input
            type="number"
            min="1"
            value={editReviewEveryDays}
            onChange={(e) => setEditReviewEveryDays(e.target.value)}
            placeholder="—"
            className="w-14 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          days
        </label>
        <button
          onClick={() => handleUpdate(project.id)}
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          Save
        </button>
        <button
          onClick={() => setEditingId(null)}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
