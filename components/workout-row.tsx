"use client";

import { useRef, useState } from "react";

export type Workout = {
  id: string;
  name: string;
  icon: string | null;
};

export type WorkoutLogAttachment = {
  id: string;
  filename: string;
  content_type: string | null;
  url: string | null;
};

export type WorkoutLog = {
  id: string;
  workout_id: string;
  logged_date: string;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  attachments: WorkoutLogAttachment[];
};

function WorkoutLogAttachmentStrip({
  log,
  onChanged,
}: {
  log: WorkoutLog;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/workout-logs/${log.id}/attachments`, {
      method: "POST",
      body: formData,
    });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to upload image");
      return;
    }
    onChanged();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/workout-log-attachments/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {log.attachments.map((a) => (
        <div key={a.id} className="group relative h-14 w-14 shrink-0">
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer">
              <img src={a.url} alt={a.filename} className="h-14 w-14 rounded-md object-cover" />
            </a>
          ) : (
            <div className="h-14 w-14 rounded-md bg-zinc-100 dark:bg-zinc-900" />
          )}
          <button
            onClick={() => handleDelete(a.id)}
            aria-label={`Remove ${a.filename}`}
            title={`Remove ${a.filename}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-xs text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:bg-zinc-50 dark:text-zinc-950"
          >
            ×
          </button>
        </div>
      ))}
      <label
        aria-label="Add image"
        title="Add image"
        className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
      >
        {uploading ? (
          <span className="text-xs">...</span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
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
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function WorkoutLogEntry({
  log,
  onUpdate,
  onDelete,
  onAttachmentsChanged,
}: {
  log: WorkoutLog;
  onUpdate: (id: string, updates: { duration_minutes?: number | null; notes?: string | null }) => void;
  onDelete: (id: string) => void;
  onAttachmentsChanged: () => void;
}) {
  const [duration, setDuration] = useState(log.duration_minutes?.toString() ?? "");
  const [notes, setNotes] = useState(log.notes ?? "");

  function commitDuration() {
    const parsed = duration.trim() === "" ? null : Number(duration);
    onUpdate(log.id, { duration_minutes: Number.isFinite(parsed as number) ? parsed : null });
  }

  function commitNotes() {
    onUpdate(log.id, { notes: notes.trim() === "" ? null : notes });
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Duration</label>
            <input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={commitDuration}
              placeholder="min"
              className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="text-xs text-zinc-500">min</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <WorkoutLogAttachmentStrip log={log} onChanged={onAttachmentsChanged} />
        </div>
        <button
          onClick={() => onDelete(log.id)}
          aria-label="Remove this entry"
          title="Remove this entry"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function WorkoutRow({
  workout,
  logs,
  onToggle,
  onAddAnother,
  onUpdateLog,
  onDeleteLog,
  onAttachmentsChanged,
  onUpdateWorkout,
  onDeleteWorkout,
}: {
  workout: Workout;
  /** This workout's logs for the currently selected date only. */
  logs: WorkoutLog[];
  onToggle: () => void;
  onAddAnother: () => void;
  onUpdateLog: (id: string, updates: { duration_minutes?: number | null; notes?: string | null }) => void;
  onDeleteLog: (id: string) => void;
  onAttachmentsChanged: () => void;
  onUpdateWorkout: (id: string, updates: Record<string, unknown>) => void;
  onDeleteWorkout: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(workout.name);
  const checked = logs.length > 0;

  function handleSave() {
    if (!name.trim()) return;
    onUpdateWorkout(workout.id, { name });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button onClick={handleSave} className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
            Save
          </button>
          <button
            onClick={() => {
              setName(workout.name);
              setEditing(false);
            }}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-3 px-4 py-3">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {workout.icon ? `${workout.icon} ` : ""}
            {workout.name}
          </p>
        </div>
        {checked && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Hide details" : "Add duration, notes, or photos"}
            title={expanded ? "Hide details" : "Add duration, notes, or photos"}
            aria-expanded={expanded}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
          </button>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            aria-label="Rename workout"
            title="Rename workout"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 sm:h-7 sm:w-7 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            onClick={() => onDeleteWorkout(workout.id)}
            aria-label="Delete workout"
            title="Delete workout"
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 sm:h-7 sm:w-7 dark:hover:bg-red-950 dark:hover:text-red-400"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
      {expanded && checked && (
        <div className="space-y-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {logs.map((log) => (
            <WorkoutLogEntry
              key={log.id}
              log={log}
              onUpdate={onUpdateLog}
              onDelete={onDeleteLog}
              onAttachmentsChanged={onAttachmentsChanged}
            />
          ))}
          <button
            type="button"
            onClick={onAddAnother}
            className="text-xs font-medium text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            + Log another session that day
          </button>
        </div>
      )}
    </li>
  );
}
