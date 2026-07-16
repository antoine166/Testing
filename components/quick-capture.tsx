"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Domain = {
  id: string;
  name: string;
};

type TaskPriority = "none" | "low" | "medium" | "high";
const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"task" | "project">("task");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [domainId, setDomainId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [waitingFor, setWaitingFor] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainsLoaded, setDomainsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (
        !open &&
        !isTyping &&
        e.key.toLowerCase() === "c" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setOpen(true);
      } else if (open && e.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    titleRef.current?.focus();

    // Only needed for Project mode — assigning a domain to a new project is
    // a planning decision, not a capture decision, so tasks never get one
    // here (GTD: capture first, decide domain/project later when processing).
    if (domainsLoaded) return;

    fetch("/api/domains")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((data: Domain[]) => {
        setDomains(data);
        setDomainsLoaded(true);
      })
      .catch(() => {
        // Domain picker just stays empty — not fatal to capture itself.
      });
  }, [open, domainsLoaded]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    const res = await fetch(mode === "project" ? "/api/projects" : "/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "project"
          ? {
              name: title,
              description: notes || undefined,
              link: link || undefined,
              domain_id: domainId || null,
              priority,
              due_date: dueDate || undefined,
              scheduled_date: scheduledDate || undefined,
            }
          : {
              title,
              notes: notes || undefined,
              link: link || undefined,
              priority,
              due_date: dueDate || undefined,
              scheduled_date: scheduledDate || undefined,
              waiting_for: waitingFor || undefined,
            },
      ),
    });

    if (!res.ok) {
      setSubmitting(false);
      const body = await res.json();
      setError(body.error ?? "Failed to save");
      return;
    }

    const created = await res.json();

    if (mode === "task" && image) {
      const formData = new FormData();
      formData.append("file", image);
      await fetch(`/api/tasks/${created.id}/attachments`, { method: "POST", body: formData });
    }

    setSubmitting(false);
    setTitle("");
    setLink("");
    setNotes("");
    setDomainId("");
    setPriority("none");
    setDueDate("");
    setScheduledDate("");
    setWaitingFor(false);
    setImage(null);
    setMode("task");
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick capture"
        title="Quick capture"
        className="fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-2xl text-white shadow-lg hover:bg-blue-600"
      >
        +
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 sm:pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                Quick capture
              </h2>
              <div className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setMode("task")}
                  className={`rounded px-2 py-1 font-medium ${
                    mode === "task"
                      ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => setMode("project")}
                  className={`rounded px-2 py-1 font-medium ${
                    mode === "project"
                      ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  Project
                </button>
              </div>
            </div>

            {error && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={mode === "project" ? "Project name" : "What's on your mind?"}
                required
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Link (optional)"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />

              <div className="flex flex-wrap gap-3">
                {mode === "project" && (
                  <select
                    value={domainId}
                    onChange={(e) => setDomainId(e.target.value)}
                    className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">No domain</option>
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-3">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDueDate(value);
                    if (value && !scheduledDate) setScheduledDate(value);
                  }}
                  aria-label="Due date"
                  title="Due date"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setScheduledDate(value);
                    if (value && !dueDate) setDueDate(value);
                  }}
                  aria-label="Scheduled date"
                  title="Scheduled date"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                {mode === "task" && (
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
                )}
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
              </div>

              {mode === "task" && (
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={waitingFor}
                    onChange={(e) => setWaitingFor(e.target.checked)}
                  />
                  Waiting for someone else
                </label>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {submitting ? "Saving..." : "Capture"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
