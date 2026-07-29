"use client";

import { useState, type FormEvent } from "react";
import { type TaskDomain } from "@/components/task-row";
import {
  PRIORITIES,
  STATUSES,
  type ProjectPriority,
  type ProjectStatus,
} from "@/lib/projects/types";

// Only what the form actually reads — structural, so both the Projects
// page (full Project rows) and the Domains page (the task hook's lighter
// project shape) can feed it.
type CreateFormProject = { id: string; name: string; domain_id: string | null };

type ProjectCreateFormProps = {
  domains: TaskDomain[];
  projects: CreateFormProject[];
  parentOptions: (excludeId?: string) => CreateFormProject[];
  domainFilter: string | null;
  setError: (message: string) => void;
  loadAll: () => Promise<void>;
  /** Called after a successful create (e.g. collapse an inline form). */
  onCreated?: () => void;
};

export default function ProjectCreateForm({
  domains,
  projects,
  parentOptions,
  domainFilter,
  setError,
  loadAll,
  onCreated,
}: ProjectCreateFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outcomeVision, setOutcomeVision] = useState("");
  const [brainstorm, setBrainstorm] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [domainId, setDomainId] = useState(domainFilter ?? "");
  const [parentProjectId, setParentProjectId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [priority, setPriority] = useState<ProjectPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [link, setLink] = useState("");

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    // A top-level project needs a domain (subprojects inherit their parent's).
    if (!domainId && !parentProjectId) {
      setError("Pick a domain for the project — it needs one to show in your sidebar.");
      return;
    }

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        purpose: purpose || undefined,
        outcome_vision: outcomeVision || undefined,
        brainstorm: brainstorm || undefined,
        domain_id: domainId || null,
        parent_project_id: parentProjectId || null,
        status,
        priority,
        due_date: dueDate || undefined,
        scheduled_date: scheduledDate || undefined,
        link: link || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to create project");
      return;
    }

    const project = await res.json();

    if (nextAction.trim()) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextAction,
          project_id: project.id,
          domain_id: domainId || null,
        }),
      });
    }

    setName("");
    setDescription("");
    setPurpose("");
    setOutcomeVision("");
    setBrainstorm("");
    setNextAction("");
    // Back to the initial state — which, on a domain-scoped form (Domains
    // page), is that domain preselected rather than empty.
    setDomainId(domainFilter ?? "");
    setParentProjectId("");
    setStatus("active");
    setPriority("none");
    setDueDate("");
    setScheduledDate("");
    setLink("");
    await loadAll();
    onCreated?.();
  }

  function selectParentProject(id: string) {
    setParentProjectId(id);
    if (id) {
      const parent = projects.find((p) => p.id === id);
      setDomainId(parent?.domain_id ?? "");
    }
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
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
          Define this project (GTD Natural Planning)
        </summary>
        <div className="mt-2 space-y-3 pl-4">
          <div>
            <label
              htmlFor="purpose"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Purpose — why does this matter?
            </label>
            <textarea
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="outcome_vision"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Outcome vision — what does &ldquo;done&rdquo; look like?
            </label>
            <textarea
              id="outcome_vision"
              value={outcomeVision}
              onChange={(e) => setOutcomeVision(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="brainstorm"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Brainstorm — ideas, approaches, things to consider
            </label>
            <textarea
              id="brainstorm"
              value={brainstorm}
              onChange={(e) => setBrainstorm(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="next_action"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Next action — the very next physical step
            </label>
            <input
              id="next_action"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Draft the outline"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">
              If filled in, creates this as the first task in the project.
            </p>
          </div>
        </div>
      </details>
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
            disabled={!!parentProjectId}
            onChange={(e) => setDomainId(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">{parentProjectId ? "No domain" : "Choose a domain…"}</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {parentProjectId && (
            <p className="mt-1 text-xs text-zinc-500">Inherits the parent&apos;s domain.</p>
          )}
        </div>
        <div>
          <label
            htmlFor="parent_project"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Parent project
          </label>
          <select
            id="parent_project"
            value={parentProjectId}
            onChange={(e) => selectParentProject(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">None (top-level project)</option>
            {parentOptions().map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
            onChange={(e) => {
              const value = e.target.value;
              setDueDate(value);
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
            }}
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
