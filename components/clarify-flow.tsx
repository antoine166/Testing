"use client";

import { useEffect, useState } from "react";
import type { Task, TaskDomain, TaskProject, TaskPriority } from "@/components/task-row";
import { looksLikeTopic, TOPIC_NUDGE } from "@/lib/tasks/next-action-shape";
import { useContexts } from "@/lib/hooks/use-contexts";

// GTD's clarify step as a guided flow: the workflow-map diagram made
// interactive. One inbox item at a time, Allen's decision tree as buttons —
// every destination already exists in the app; this just walks you through
// choosing one, so inbox zero is mechanical instead of an editing session.

type Panel =
  | "decide" // actionable or not?
  | "timer" // < 2 min: do it now
  | "defer" // next action: rewrite title, file, date it
  | "delegate" // waiting for someone
  | "tickler" // incubate until a date
  | "project"; // converted; capture the very next action

const TWO_MINUTES = 120;

type Props = {
  queue: string[]; // inbox task ids, snapshotted when the flow starts
  tasks: Task[];
  domains: TaskDomain[];
  projects: TaskProject[];
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onToggleDone: (task: Task) => Promise<void>;
  onConvertToProject: (id: string) => Promise<{ id: string; domain_id: string | null } | null>;
  onConvertToReference: (id: string) => Promise<void>;
  onCreateTask: (input: Record<string, unknown>) => Promise<Task | null>;
  onExit: () => void;
};

export default function ClarifyFlow({
  queue,
  tasks,
  domains,
  projects,
  onUpdate,
  onTrash,
  onToggleDone,
  onConvertToProject,
  onConvertToReference,
  onCreateTask,
  onExit,
}: Props) {
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState<Panel>("decide");
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const locations = useContexts();

  // Per-item panel state
  const [deferTitle, setDeferTitle] = useState("");
  const [deferDomain, setDeferDomain] = useState("");
  const [deferProject, setDeferProject] = useState("");
  const [deferContext, setDeferContext] = useState("");
  const [deferPriority, setDeferPriority] = useState<TaskPriority>("none");
  const [deferDue, setDeferDue] = useState("");
  const [deferScheduled, setDeferScheduled] = useState("");
  const [deferTime, setDeferTime] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [ticklerDate, setTicklerDate] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [newProject, setNewProject] = useState<{ id: string; domain_id: string | null } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TWO_MINUTES);

  const currentId = queue[index];
  const task = currentId ? tasks.find((t) => t.id === currentId) : undefined;
  const remaining = queue.length - index;

  // The item may have been processed elsewhere (another tab, the Coach)
  // while the flow was open — adjust during render, not in an effect.
  if (currentId && !task && index < queue.length) {
    setIndex(index + 1);
    setPanel("decide");
  }

  useEffect(() => {
    if (panel !== "timer") return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [panel]);

  function resetPanelState(nextTask: Task | undefined) {
    setPanel("decide");
    setDeferTitle(nextTask?.title ?? "");
    setDeferDomain("");
    setDeferProject("");
    setDeferContext("");
    setDeferPriority("none");
    setDeferDue("");
    setDeferScheduled("");
    setDeferTime("");
    setWaitingOn("");
    setFollowUp("");
    setTicklerDate("");
    setNextAction("");
    setNewProject(null);
    setSecondsLeft(TWO_MINUTES);
  }

  // Seed the defer title when arriving at a new item (adjust during render).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (task && seededFor !== task.id) {
    setSeededFor(task.id);
    resetPanelState(task);
  }

  function advance() {
    setProcessed((n) => n + 1);
    setIndex((i) => i + 1);
    setPanel("decide");
  }

  function skip() {
    setIndex((i) => i + 1);
    setPanel("decide");
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      advance();
    } finally {
      setBusy(false);
    }
  }

  if (index >= queue.length || queue.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 p-8 text-center dark:border-zinc-800">
        <p className="text-3xl">🎉</p>
        <p className="mt-2 text-lg font-semibold">Inbox clarified</p>
        <p className="mt-1 text-sm text-zinc-500">
          {processed} item{processed === 1 ? "" : "s"} processed
          {queue.length - processed > 0 ? `, ${queue.length - processed} skipped` : ""}.
        </p>
        <button
          onClick={onExit}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Done
        </button>
      </div>
    );
  }

  if (!task) return null; // render-adjust above is about to advance

  const projectOptions = deferDomain
    ? projects.filter((p) => !p.domain_id || p.domain_id === deferDomain)
    : projects;
  // Preserve a current value that isn't in the list as a selectable option.
  const locationOptions =
    deferContext && !locations.includes(deferContext)
      ? [deferContext, ...locations]
      : locations;

  const buttonBase =
    "rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50";
  const neutralButton = `${buttonBase} border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          Clarifying · {remaining} left
        </span>
        <div className="flex gap-2">
          <button onClick={skip} disabled={busy} className="underline">
            Skip for now
          </button>
          <button onClick={onExit} disabled={busy} className="underline">
            Exit
          </button>
        </div>
      </div>

      <p className="text-lg font-medium">{task.title}</p>
      {task.notes && <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-500">{task.notes}</p>}
      {task.link && (
        <a
          href={task.link}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-sm text-blue-600 underline dark:text-blue-400"
        >
          {task.link}
        </a>
      )}

      {panel === "decide" && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Actionable?
            </p>
            <button disabled={busy} onClick={() => setPanel("timer")} className={`${neutralButton} block w-full`}>
              ⚡ Do it now <span className="text-zinc-500">— under 2 minutes</span>
            </button>
            <button disabled={busy} onClick={() => setPanel("defer")} className={`${neutralButton} block w-full`}>
              📋 Defer it <span className="text-zinc-500">— decide the next action</span>
            </button>
            <button disabled={busy} onClick={() => setPanel("delegate")} className={`${neutralButton} block w-full`}>
              🤝 Delegate it <span className="text-zinc-500">— hand off, track in Waiting For</span>
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const project = await onConvertToProject(task.id);
                  if (project) {
                    setNewProject(project);
                    setPanel("project");
                  }
                } finally {
                  setBusy(false);
                }
              }}
              className={`${neutralButton} block w-full`}
            >
              🗂️ It&apos;s a project <span className="text-zinc-500">— more than one step</span>
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Not actionable?
            </p>
            <button
              disabled={busy}
              onClick={() => act(() => onTrash(task.id))}
              className={`${neutralButton} block w-full`}
            >
              🗑️ Trash it <span className="text-zinc-500">— recoverable for 30 days</span>
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => onUpdate(task.id, { someday: true }))}
              className={`${neutralButton} block w-full`}
            >
              📦 Someday / Maybe <span className="text-zinc-500">— might do it, not now</span>
            </button>
            <button disabled={busy} onClick={() => setPanel("tickler")} className={`${neutralButton} block w-full`}>
              🔔 Tickler <span className="text-zinc-500">— resurface on a date</span>
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => onConvertToReference(task.id))}
              className={`${neutralButton} block w-full`}
            >
              📖 Reference <span className="text-zinc-500">— file in the Library</span>
            </button>
          </div>
        </div>
      )}

      {panel === "timer" && (
        <div className="mt-4 text-center">
          <p
            className={`font-mono text-4xl ${secondsLeft === 0 ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {secondsLeft > 0
              ? "Go do it — right now, before the timer runs out."
              : "Time's up — if it's genuinely almost done, finish it; otherwise it wasn't a 2-minute task. Defer it."}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              disabled={busy}
              onClick={() => act(() => onToggleDone(task))}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              ✓ Did it
            </button>
            <button
              disabled={busy}
              onClick={() => setPanel("defer")}
              className={neutralButton}
            >
              Longer than I thought — defer
            </button>
            <button disabled={busy} onClick={() => setPanel("decide")} className={neutralButton}>
              Back
            </button>
          </div>
        </div>
      )}

      {panel === "defer" && (
        <div className="mt-4 space-y-2">
          <label className="block text-xs text-zinc-500">
            Rewrite as the very next physical action
            <input
              value={deferTitle}
              onChange={(e) => setDeferTitle(e.target.value)}
              placeholder='e.g. "Call Dr. Lee to book the follow-up" — a visible action, not a topic'
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {looksLikeTopic(deferTitle) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{TOPIC_NUDGE}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-zinc-500">
              Domain
              <select
                value={deferDomain}
                onChange={(e) => {
                  setDeferDomain(e.target.value);
                  setDeferProject("");
                }}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Inbox</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Project
              <select
                value={deferProject}
                onChange={(e) => setDeferProject(e.target.value)}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">None</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Location
              <select
                value={deferContext}
                onChange={(e) => setDeferContext(e.target.value)}
                title="Location — where / with what you can do it"
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Location…</option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Priority
              <select
                value={deferPriority}
                onChange={(e) => setDeferPriority(e.target.value as TaskPriority)}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {(["none", "low", "medium", "high"] as const).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Due
              <input
                type="date"
                value={deferDue}
                onChange={(e) => setDeferDue(e.target.value)}
                title="A real deadline only — the day it must be done."
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Scheduled
              <input
                type="date"
                value={deferScheduled}
                onChange={(e) => {
                  setDeferScheduled(e.target.value);
                  if (!e.target.value) setDeferTime("");
                }}
                title="The day you intend to work on it — independent of any deadline."
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            {deferScheduled && (
              <label className="text-xs text-zinc-500">
                Time
                <input
                  type="time"
                  value={deferTime}
                  onChange={(e) => setDeferTime(e.target.value)}
                  className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            )}
          </div>
          {!deferDomain && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No domain — it&apos;ll stay in the Inbox as unprocessed.
            </p>
          )}
          <div className="flex gap-2">
            <button
              disabled={busy || !deferTitle.trim()}
              onClick={() =>
                act(() =>
                  onUpdate(task.id, {
                    title: deferTitle.trim(),
                    domain_id: deferDomain || null,
                    project_id: deferProject || null,
                    context: deferContext.trim() || null,
                    priority: deferPriority,
                    due_date: deferDue || null,
                    scheduled_date: deferScheduled || null,
                    scheduled_time: deferScheduled && deferTime ? deferTime : null,
                  }),
                )
              }
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save & next
            </button>
            <button disabled={busy} onClick={() => setPanel("decide")} className={neutralButton}>
              Back
            </button>
          </div>
        </div>
      )}

      {panel === "delegate" && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-zinc-500">
              Waiting on
              <input
                value={waitingOn}
                onChange={(e) => setWaitingOn(e.target.value)}
                placeholder="who?"
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Follow up
              <input
                type="date"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Moves to Waiting For{followUp ? " and prompts you to follow up on that date" : ""}.
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() =>
                act(() =>
                  onUpdate(task.id, {
                    waiting_for: true,
                    waiting_on: waitingOn.trim() || null,
                    follow_up_date: followUp || null,
                  }),
                )
              }
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save & next
            </button>
            <button disabled={busy} onClick={() => setPanel("decide")} className={neutralButton}>
              Back
            </button>
          </div>
        </div>
      )}

      {panel === "tickler" && (
        <div className="mt-4 space-y-2">
          <label className="block text-xs text-zinc-500">
            Resurface on
            <input
              type="date"
              value={ticklerDate}
              onChange={(e) => setTicklerDate(e.target.value)}
              className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Goes to Someday and pops back up as &ldquo;Ready to revisit&rdquo; on that date.
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy || !ticklerDate}
              onClick={() => act(() => onUpdate(task.id, { someday: true, revisit_date: ticklerDate }))}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save & next
            </button>
            <button disabled={busy} onClick={() => setPanel("decide")} className={neutralButton}>
              Back
            </button>
          </div>
        </div>
      )}

      {panel === "project" && (
        <div className="mt-4 space-y-2">
          <p className="text-sm">
            Project created ✓ — what&apos;s the <em>very next physical action</em> to move it forward?
          </p>
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder='e.g. "Email Sarah for the venue shortlist"'
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {looksLikeTopic(nextAction) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{TOPIC_NUDGE}</p>
          )}
          <div className="flex gap-2">
            <button
              disabled={busy || !nextAction.trim()}
              onClick={() =>
                act(async () => {
                  if (!newProject) return;
                  await onCreateTask({
                    title: nextAction.trim(),
                    project_id: newProject.id,
                    domain_id: newProject.domain_id ?? undefined,
                  });
                })
              }
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add & next
            </button>
            <button disabled={busy} onClick={advance} className={neutralButton}>
              Skip — I&apos;ll plan it later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
