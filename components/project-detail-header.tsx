"use client";

import Link from "next/link";
import { type TaskDomain } from "@/components/task-row";
import { type Project } from "@/lib/projects/types";

// The read-mode header of the project detail page (#147 follow-up): name,
// meta line, planning fields, and the same action toolbar as the
// All-Projects card (template / plan / complete / edit / delete).
// Extracted so the page itself stays under the ~500-line guideline.
export type ProjectDetailHeaderProps = {
  project: Project;
  domain?: TaskDomain;
  parentProject?: Project;
  onSaveAsTemplate: (project: Project) => Promise<void>;
  onCompleteProject: (project: Project) => Promise<void>;
  onStartEdit: (project: Project) => void;
  onDeleteProject: (id: string) => Promise<void>;
};

export default function ProjectDetailHeader({
  project,
  domain,
  parentProject,
  onSaveAsTemplate,
  onCompleteProject,
  onStartEdit,
  onDeleteProject,
}: ProjectDetailHeaderProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {domain && (
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: domain.color }}
            />
          )}
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            {project.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onSaveAsTemplate(project)}
            aria-label="Save as template"
            title="Save as template — reuse this project's shape (fields + open tasks)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
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
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
          </button>
          <Link
            href={`/plan?project=${project.id}`}
            aria-label="Plan project (Natural Planning Model)"
            title="Plan project (Natural Planning Model)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
          >
            🧭
          </Link>
          {project.status !== "completed" && (
            <button
              onClick={() => onCompleteProject(project)}
              aria-label="Complete project"
              title="Complete project"
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
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
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onStartEdit(project)}
            aria-label="Edit project"
            title="Edit project"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
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
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            onClick={() => onDeleteProject(project.id)}
            aria-label="Delete project"
            title="Delete project"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
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
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {project.status}
        {project.priority !== "none" ? ` · ${project.priority} priority` : ""}
        {project.due_date ? ` · due ${project.due_date}` : ""}
        {project.scheduled_date ? ` · scheduled ${project.scheduled_date}` : ""}
        {domain ? ` · ${domain.name}` : ""}
        {parentProject && (
          <>
            {" · part of "}
            <Link href={`/projects/${parentProject.id}`} className="underline">
              {parentProject.name}
            </Link>
          </>
        )}
      </p>
      {project.description && (
        <p className="mt-2 text-sm text-zinc-500">{project.description}</p>
      )}
      {project.purpose && (
        <p className="mt-1 text-xs text-zinc-500">
          <span className="font-medium">Purpose:</span> {project.purpose}
        </p>
      )}
      {project.outcome_vision && (
        <p className="mt-1 text-xs text-zinc-500">
          <span className="font-medium">Done looks like:</span> {project.outcome_vision}
        </p>
      )}
      {project.brainstorm && (
        <p className="mt-1 text-xs text-zinc-500">
          <span className="font-medium">Brainstorm:</span> {project.brainstorm}
        </p>
      )}
      {project.link && (
        <a
          href={project.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          {project.link}
        </a>
      )}
    </>
  );
}
