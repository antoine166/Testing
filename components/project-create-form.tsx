"use client";

import { useState, type FormEvent } from "react";
import { type TaskDomain } from "@/components/task-row";
import { PRIORITIES, type ProjectPriority } from "@/lib/projects/types";
import {
  EMPTY_PROJECT_EXTRAS,
  ProjectPlanningFields,
  ProjectParentStatusFields,
  createFirstTask,
  projectExtrasPayload,
  type ProjectExtrasDraft,
} from "@/components/project-capture-extras";

// Only what the form actually reads — structural, so both the Projects
// page (full Project rows) and lighter project shapes can feed it.
type CreateFormProject = {
  id: string;
  name: string;
  domain_id: string | null;
  status?: string;
  parent_project_id?: string | null;
};

type ProjectCreateFormProps = {
  domains: TaskDomain[];
  projects: CreateFormProject[];
  domainFilter: string | null;
  setError: (message: string) => void;
  loadAll: () => Promise<void>;
  /** Called after a successful create (e.g. collapse an inline form). */
  onCreated?: () => void;
};

export default function ProjectCreateForm({
  domains,
  projects,
  domainFilter,
  setError,
  loadAll,
  onCreated,
}: ProjectCreateFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domainId, setDomainId] = useState(domainFilter ?? "");
  // Planning + parent + status live in the shared extras draft — the same
  // component the Today/Inbox/Domains capture sliders render, so all four
  // project-creation surfaces stay identical.
  const [extras, setExtras] = useState<ProjectExtrasDraft>(EMPTY_PROJECT_EXTRAS);
  const patchExtras = (patch: Partial<ProjectExtrasDraft>) =>
    setExtras((prev) => ({ ...prev, ...patch }));
  const [priority, setPriority] = useState<ProjectPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [link, setLink] = useState("");

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    // A top-level project needs a domain (subprojects inherit their parent's).
    if (!domainId && !extras.parent_project_id) {
      setError("Pick a domain for the project — it needs one to show in your sidebar.");
      return;
    }

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        domain_id: domainId || null,
        priority,
        due_date: dueDate || undefined,
        scheduled_date: scheduledDate || undefined,
        link: link || undefined,
        ...projectExtrasPayload(extras),
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create project");
      return;
    }

    const project = await res.json();
    await createFirstTask(extras.next_action, project.id, domainId || null);

    setName("");
    setDescription("");
    // Back to the initial state — which, on a domain-scoped form (Domains
    // page), is that domain preselected rather than empty.
    setDomainId(domainFilter ?? "");
    setExtras(EMPTY_PROJECT_EXTRAS);
    setPriority("none");
    setDueDate("");
    setScheduledDate("");
    setLink("");
    await loadAll();
    onCreated?.();
  }

  return (
    <form
      onSubmit={handleCreate}
      className="mb-8 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          New project
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kitchen remodel"
          required
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Description (optional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <ProjectPlanningFields idPrefix="proj-create" draft={extras} onChange={patchExtras} />
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
          placeholder="e.g. a shared doc or spec"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      {/* Domain before parent (Antoine's call): the domain is the primary
          filing decision; a parent project is the exception. */}
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
            disabled={!!extras.parent_project_id}
            onChange={(e) => setDomainId(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">
              {extras.parent_project_id ? "No domain" : "Choose a domain…"}
            </option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {extras.parent_project_id && (
            <p className="mt-1 text-xs text-zinc-500">Inherits the parent&apos;s domain.</p>
          )}
        </div>
        <ProjectParentStatusFields
          idPrefix="proj-create"
          draft={extras}
          onChange={patchExtras}
          projects={projects}
          onParentPicked={(pickedDomainId) => setDomainId(pickedDomainId ?? "")}
        />
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
            onChange={(e) => setPriority(e.target.value as ProjectPriority)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
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
            onChange={(e) => setDueDate(e.target.value)}
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
            onChange={(e) => setScheduledDate(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Add
        </button>
      </div>
    </form>
  );
}
