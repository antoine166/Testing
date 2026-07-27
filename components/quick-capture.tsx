"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { enqueueCapture } from "@/lib/offline-queue";
import { projectConversionToast, useToast } from "@/components/toast";

// Minimal Web Speech API surface — TS has no built-in types for the
// prefixed webkit implementation (the only one that ships in Chrome).
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Domain = {
  id: string;
  name: string;
};

type TaskPriority = "none" | "low" | "medium" | "high";
const PRIORITIES: TaskPriority[] = ["none", "low", "medium", "high"];

export default function QuickCapture() {
  const { showToast } = useToast();
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
  const [queuedNotice, setQueuedNotice] = useState(false);
  const [listening, setListening] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // SSR-safe without state: the mic button only renders inside the modal,
  // and `open` can't be true during server render — so this window access
  // only ever runs client-side.
  const speechSupported = open && getSpeechRecognition() !== null;

  // Voice capture: speak the thought instead of typing it. Appends the
  // final transcript to the title so a half-typed title isn't clobbered.
  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) =>
        event.results[i][0].transcript.trim(),
      )
        .join(" ")
        .trim();
      if (transcript) {
        setTitle((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      titleRef.current?.focus();
    };
    recognition.onerror = () => {
      // onend fires after onerror and handles cleanup — mic denied or no
      // speech just leaves the title as it was.
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  // Don't leave the mic running if the modal closes mid-dictation.
  useEffect(() => {
    if (!open) recognitionRef.current?.stop();
  }, [open]);

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

  function resetForm() {
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
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    const payload =
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
          };

    let res: Response;
    try {
      res = await fetch(mode === "project" ? "/api/projects" : "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // No connection — queue it instead of losing it, synced automatically
      // once we're back online (see lib/offline-queue.ts).
      try {
        await enqueueCapture({ mode, payload, image: mode === "task" ? image : null });
      } catch {
        // Queueing itself failed (e.g. IndexedDB unavailable) — surface a
        // normal error rather than leaving the form stuck on "Saving...".
        setSubmitting(false);
        setError("Couldn't save — check your connection and try again.");
        return;
      }
      setSubmitting(false);
      resetForm();
      setQueuedNotice(true);
      setTimeout(() => {
        setQueuedNotice(false);
        setOpen(false);
      }, 1400);
      return;
    }

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

    // The modal closes over whatever page the user was on, so the capture
    // needs a visible receipt — especially projects, which never appear in
    // a smart list, and Waiting For items, which skip the Inbox.
    if (mode === "project") {
      showToast(...projectConversionToast(created, domains));
    } else if (waitingFor) {
      showToast(`Captured to Waiting For: “${created.title}”`, {
        label: "View",
        href: "/waiting-for",
      });
    } else {
      showToast(`Captured to Inbox: “${created.title}”`, { label: "View", href: "/inbox" });
    }

    setSubmitting(false);
    resetForm();
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

            {queuedNotice && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                Saved — will sync when you&apos;re back online.
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-2">
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    listening
                      ? "Listening…"
                      : mode === "project"
                        ? "Project name"
                        : "What's on your mind?"
                  }
                  required
                  className="w-full flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    aria-label={listening ? "Stop dictating" : "Dictate title"}
                    title={listening ? "Stop dictating" : "Dictate title"}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm ${
                      listening
                        ? "border-red-400 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                        : "border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    {listening ? "■" : "🎤"}
                  </button>
                )}
              </div>
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
