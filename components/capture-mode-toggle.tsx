"use client";

/**
 * The Task | Project segmented toggle every capture box shares (Today,
 * Inbox, Tasks/domain views). Extracted verbatim in the July 2026
 * capture-form split — no behavior change, one source of truth for the
 * slider's look.
 */
export type CaptureMode = "task" | "project";

export default function CaptureModeToggle({
  mode,
  onChange,
}: {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
}) {
  const segment = (target: CaptureMode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(target)}
      className={`rounded px-2 py-1 font-medium ${
        mode === target
          ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
      {segment("task", "Task")}
      {segment("project", "Project")}
    </div>
  );
}
