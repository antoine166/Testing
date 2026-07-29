"use client";

import { useEffect, useRef, useState } from "react";
import { computeWeeklyGoalStreak, countThisWeek, isAtRisk } from "@/lib/workouts/weekly";
import { tapHaptic } from "@/lib/haptics";

export type Workout = {
  id: string;
  name: string;
  icon: string | null;
  weekly_target: number | null;
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
  date,
  today,
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
  /** The date currently being logged/viewed (may be in the past). */
  date: string;
  /** The real current date, used for weekly-goal math regardless of `date`. */
  today: string;
  /** All of this workout's logs (not date-filtered) — needed for the weekly-goal count/streak. */
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
  const [weeklyTarget, setWeeklyTarget] = useState(workout.weekly_target?.toString() ?? "");
  // #154: logging gets its own reward (💪 flex + amber/emerald burst + row
  // flash) on the control that was tapped. Purely visual — the save still
  // fires immediately (the row stays mounted, unlike habits on Today), and
  // unlogging stays silent.
  const [celebrate, setCelebrate] = useState(false);
  const celebrateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (celebrateTimeoutRef.current) clearTimeout(celebrateTimeoutRef.current);
    };
  }, []);

  const logsForDate = logs.filter((l) => l.logged_date === date);
  const checked = logsForDate.length > 0;

  function handleToggleChange() {
    if (!checked) {
      tapHaptic();
      setCelebrate(true);
      if (celebrateTimeoutRef.current) clearTimeout(celebrateTimeoutRef.current);
      celebrateTimeoutRef.current = setTimeout(() => setCelebrate(false), 650);
    }
    onToggle();
  }

  const weekCount = workout.weekly_target ? countThisWeek(logs, today) : 0;
  const { current: weekStreak } = workout.weekly_target
    ? computeWeeklyGoalStreak(logs, today, workout.weekly_target)
    : { current: 0 };
  const atRisk = workout.weekly_target ? isAtRisk(logs, today, workout.weekly_target) : false;
  const remainingNeeded = workout.weekly_target ? workout.weekly_target - weekCount : 0;

  function handleSave() {
    if (!name.trim()) return;
    const parsedTarget = weeklyTarget.trim() === "" ? null : Number(weeklyTarget);
    onUpdateWorkout(workout.id, {
      name,
      weekly_target: Number.isFinite(parsedTarget as number) ? parsedTarget : null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Weekly goal</label>
            <input
              type="number"
              min={1}
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(e.target.value)}
              placeholder="none"
              className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="text-xs text-zinc-500">times/week</span>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
              Save
            </button>
            <button
              onClick={() => {
                setName(workout.name);
                setWeeklyTarget(workout.weekly_target?.toString() ?? "");
                setEditing(false);
              }}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`rounded-md border ${celebrate ? "workout-row-flash " : ""}${
        atRisk
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="relative flex shrink-0 items-center justify-center">
          <input type="checkbox" checked={checked} onChange={handleToggleChange} />
          {celebrate && (
            <>
              {/* Double burst from the log control: amber leads, emerald trails. */}
              <span className="workout-burst pointer-events-none absolute inset-0 m-auto rounded-full border-2 border-amber-400" />
              <span className="workout-burst workout-burst-2 pointer-events-none absolute inset-0 m-auto rounded-full border-2 border-emerald-400" />
              {/* The flex, springing in over the control that was tapped. */}
              <span className="workout-flex pointer-events-none absolute inset-0 z-10 m-auto flex items-center justify-center text-lg leading-none">
                💪
              </span>
            </>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {atRisk ? "⚠️ " : weekStreak > 0 ? "🔥 " : ""}
            {workout.icon ? `${workout.icon} ` : ""}
            {workout.name}
          </p>
          {workout.weekly_target && (
            <p className="text-xs text-zinc-500">
              {weekCount >= workout.weekly_target ? "🎯 " : ""}
              {weekCount}/{workout.weekly_target} this week
              {weekStreak > 0 ? ` · ${weekStreak} wk streak` : ""}
            </p>
          )}
          {atRisk && (
            <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
              Running out of days — need {remainingNeeded} more this week
            </p>
          )}
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
          {logsForDate.map((log) => (
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
