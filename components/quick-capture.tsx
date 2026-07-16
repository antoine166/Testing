"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Domain = {
  id: string;
  name: string;
};

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [domainId, setDomainId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainsLoaded, setDomainsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [link, setLink] = useState("");
  const [image, setImage] = useState<File | null>(null);
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

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        notes: notes || undefined,
        link: link || undefined,
        domain_id: domainId || null,
        due_date: dueDate || undefined,
      }),
    });

    if (!res.ok) {
      setSubmitting(false);
      const body = await res.json();
      setError(body.error ?? "Failed to save");
      return;
    }

    const task = await res.json();

    if (image) {
      const formData = new FormData();
      formData.append("file", image);
      await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body: formData });
    }

    setSubmitting(false);
    setTitle("");
    setNotes("");
    setLink("");
    setImage(null);
    setShowMore(false);
    setDomainId("");
    setDueDate("");
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
            <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Quick capture
            </h2>

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
                placeholder="What's on your mind?"
                required
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex gap-3">
                <select
                  value={domainId}
                  onChange={(e) => setDomainId(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">No domain (Inbox)</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>

              {showMore ? (
                <div className="space-y-3">
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="Link (optional)"
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-500">
                    <span className="flex h-9 cursor-pointer items-center rounded-md border border-dashed border-zinc-300 px-3 hover:border-zinc-400 dark:border-zinc-700">
                      {image ? image.name : "+ Add image"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMore(true)}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  + Add link or image
                </button>
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
