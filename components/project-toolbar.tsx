"use client";

import Link from "next/link";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { PROJECT_CELEBRATE_MS } from "@/components/project-celebration";

/**
 * The project action row (template / plan / complete / edit / delete) as a
 * self-contained strip for surfaces outside the Projects page — currently
 * the project-filtered Tasks view. Same icons and confirm semantics as the
 * ProjectCard toolbar; Edit deep-links to the detail page's inline form
 * (?edit=1) instead of duplicating the form here.
 */
type ToolbarProject = {
  id: string;
  name: string;
  status?: string;
  parent_project_id?: string | null;
};

export default function ProjectToolbar({
  project,
  hasSubprojects,
  openCount,
  onError,
  onChanged,
  afterDelete,
  onCelebrate,
}: {
  project: ToolbarProject;
  hasSubprojects: boolean;
  /** Open tasks in the project — quoted in the Complete confirm. */
  openCount: number;
  onError: (message: string) => void;
  /** Refetch after complete/template. */
  onChanged: () => void | Promise<void>;
  /** Where to go after a successful delete. */
  afterDelete: () => void;
  /**
   * Host page's celebration switch (#125): flipped on when Complete is
   * confirmed, off after PROJECT_CELEBRATE_MS (or immediately on failure).
   * The page renders <ProjectCelebration /> over its own header while true.
   */
  onCelebrate?: (celebrating: boolean) => void;
}) {
  const { confirm, prompt } = useConfirmDialog();

  async function handleSaveAsTemplate() {
    const name = await prompt({ message: "Template name:", defaultValue: project.name });
    if (name === null) return;
    const res = await fetch("/api/project-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_project_id: project.id, name }),
    });
    if (!res.ok) {
      const body = await res.json();
      onError(body.error ?? "Failed to save template");
      return;
    }
    await onChanged();
  }

  async function handleComplete() {
    if (
      !(await confirm({
        message: `Complete “${project.name}”?${
          openCount > 0
            ? ` Its ${openCount} open task${openCount === 1 ? "" : "s"} will be completed with it.`
            : ""
        }`,
        confirmLabel: "Complete project",
      }))
    )
      return;
    // Celebration first, save behind it — same as the Projects and detail
    // pages (#125), so finishing a project feels like a milestone on every
    // surface that can do it.
    onCelebrate?.(true);
    setTimeout(() => onCelebrate?.(false), PROJECT_CELEBRATE_MS);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    if (!res.ok) {
      onCelebrate?.(false);
      const body = await res.json();
      onError(body.error ?? "Failed to complete project");
      return;
    }
    await onChanged();
  }

  async function handleDelete() {
    const message = hasSubprojects
      ? "Move this project to trash? Its subprojects and all their tasks move with it, and you can restore them together within 30 days."
      : "Move this project to trash? Its tasks move with it, and you can restore them together within 30 days.";
    if (!(await confirm({ message, confirmLabel: "Move to Trash", danger: true }))) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      onError(body.error ?? "Failed to delete project");
      return;
    }
    afterDelete();
  }

  const iconButton =
    "flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={handleSaveAsTemplate}
        aria-label="Save as template"
        title="Save as template — reuse this project's shape (fields + open tasks)"
        className={iconButton}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      </button>
      <Link
        href={`/plan?project=${project.id}`}
        aria-label="Plan project (Natural Planning Model)"
        title="Plan project (Natural Planning Model)"
        className={iconButton}
      >
        🧭
      </Link>
      {project.status !== "completed" && (
        <button
          onClick={handleComplete}
          aria-label="Complete project"
          title="Complete project"
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      )}
      <Link
        href={`/projects/${project.id}?edit=1`}
        aria-label="Edit project"
        title="Edit project"
        className={iconButton}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </Link>
      <button
        onClick={handleDelete}
        aria-label="Delete project"
        title="Delete project"
        className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  );
}
