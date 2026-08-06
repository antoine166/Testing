"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import type { Task, TaskDomain, TaskProject, TaskPriority, TaskEnergy } from "@/components/task-row";
import { looksLikeTopic, TOPIC_NUDGE } from "@/lib/tasks/next-action-shape";
import { useContexts } from "@/lib/hooks/use-contexts";
import { TIME_BUCKETS, minutesToBucketValue } from "@/lib/tasks/context-options";
import { PRIORITIES } from "@/lib/tasks/constants";
import { selectableProjects } from "@/lib/projects/selectable";
import { shouldAutoAdvance } from "@/lib/tasks/clarify-advance";

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
  | "projdomain" // it's a project: pick its domain first (required)
  | "project"; // converted; capture the very next action

const TWO_MINUTES = 120;
/** How long the finished card's slide-out plays before the next card mounts (#141). */
const CARD_LEAVE_MS = 180;
const ACTION_FAILED =
  "That didn't go through — the item is unchanged. Check your connection and try again.";

type Props = {
  queue: string[]; // inbox task ids, snapshotted when the flow starts
  tasks: Task[];
  domains: TaskDomain[];
  projects: TaskProject[];
  // Mutation callbacks report success (false/null = failed or cancelled)
  // so the flow can stop instead of advancing past a silent failure (#118).
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<boolean>;
  onTrash: (id: string) => Promise<boolean>;
  onToggleDone: (task: Task) => Promise<boolean>;
  onConvertToProject: (id: string) => Promise<{ id: string; domain_id: string | null } | null>;
  onConvertToReference: (id: string) => Promise<boolean>;
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
  // #141: the current card is sliding out (about to be replaced). Blocks
  // input for the ~180ms window the same way busy does.
  const [cardLeaving, setCardLeaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const locations = useContexts();

  // Per-item state. Title, notes, and context (location) are edited from a
  // persistent header shown above *every* action panel, so an item can be
  // fixed up no matter how it's being clarified (deferred, tickled, filed…).
  const [deferTitle, setDeferTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [deferDomain, setDeferDomain] = useState("");
  const [deferProject, setDeferProject] = useState("");
  const [deferContext, setDeferContext] = useState("");
  // Raw minutes string (same trick as TaskExtraFields): the Time select
  // displays the bucket, but an untouched legacy estimate (e.g. 45) is
  // written back unchanged instead of being snapped to its bucket.
  const [deferMinutes, setDeferMinutes] = useState("");
  const [deferEnergy, setDeferEnergy] = useState<TaskEnergy | "">("");
  const [link, setLink] = useState("");
  const [deferPriority, setDeferPriority] = useState<TaskPriority>("none");
  const [deferDue, setDeferDue] = useState("");
  const [deferScheduled, setDeferScheduled] = useState("");
  const [deferTime, setDeferTime] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [ticklerDate, setTicklerDate] = useState("");
  const [projectDomain, setProjectDomain] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [newProject, setNewProject] = useState<{ id: string; domain_id: string | null } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TWO_MINUTES);

  const currentId = queue[index];
  const liveTask = currentId ? tasks.find((t) => t.id === currentId) : undefined;
  const remaining = queue.length - index;
  // Double-clicks must stay blocked through both the action AND the
  // card's exit animation window.
  const blocked = busy || cardLeaving;

  // The item may have been processed elsewhere (another tab, the Coach)
  // while the flow was open — adjust during render, not in an effect.
  // Only for OUT-OF-BAND removals: the flow's own trash/convert/done
  // actions remove the task optimistically mid-action, and advancing on
  // those hijacked the flow — most visibly mounting the next inbox item
  // under the post-convert "what's the next action?" panel as if it
  // belonged to the new project. shouldAutoAdvance tells the cases apart.
  if (
    shouldAutoAdvance({
      hasCurrentEntry: Boolean(currentId) && index < queue.length,
      taskInList: Boolean(liveTask),
      actionInFlight: blocked,
      awaitingNextAction: panel === "project",
    })
  ) {
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
    setNotes(nextTask?.notes ?? "");
    setDeferDomain("");
    setDeferProject("");
    setDeferContext(nextTask?.context ?? "");
    setDeferMinutes(nextTask?.estimated_minutes?.toString() ?? "");
    setDeferEnergy(nextTask?.energy_level ?? "");
    setLink(nextTask?.link ?? "");
    setDeferPriority("none");
    setDeferDue("");
    setDeferScheduled("");
    setDeferTime("");
    setWaitingOn("");
    setFollowUp("");
    setTicklerDate("");
    setProjectDomain(nextTask?.domain_id ?? "");
    setNextAction("");
    setNewProject(null);
    setSecondsLeft(TWO_MINUTES);
  }

  // Seed the defer title when arriving at a new item (adjust during render).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  // Snapshot of the seeded task: the flow's own optimistic removals take it
  // out of `tasks` mid-action, and the card must keep rendering it (for the
  // slide-out and the post-convert "project" panel) instead of blanking.
  const [seededTask, setSeededTask] = useState<Task | null>(null);
  if (liveTask && seededFor !== liveTask.id) {
    setSeededFor(liveTask.id);
    setSeededTask(liveTask);
    resetPanelState(liveTask);
  }

  const task = liveTask ?? (seededFor === currentId ? (seededTask ?? undefined) : undefined);

  // #141: play the card's slide-out, then swap to the next item (whose
  // keyed wrapper slides in from the right). The save itself has already
  // happened by the time this runs — only the visual swap is delayed.
  function transitionCard(step: () => void) {
    if (prefersReducedMotion()) {
      step();
      return;
    }
    setCardLeaving(true);
    setTimeout(() => {
      setCardLeaving(false);
      step();
    }, CARD_LEAVE_MS);
  }

  function advance() {
    transitionCard(() => {
      setProcessed((n) => n + 1);
      setIndex((i) => i + 1);
      setPanel("decide");
      setActionError(null);
    });
  }

  function skip() {
    transitionCard(() => {
      setIndex((i) => i + 1);
      setPanel("decide");
      setActionError(null);
    });
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      // The shared handlers report failure to page-level error state that
      // this full-screen flow hides — so a failed save used to advance
      // anyway and the item silently stayed unprocessed (#118). false/null
      // means it didn't happen: stay on the item and say so here.
      const result = await action();
      if (result === false || result === null) {
        setActionError(ACTION_FAILED);
        return;
      }
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

  const projectOptions = selectableProjects(
    deferDomain
      ? projects.filter((p) => !p.domain_id || p.domain_id === deferDomain)
      : projects,
    deferProject,
  );
  // Preserve a current value that isn't in the list as a selectable option.
  const locationOptions =
    deferContext && !locations.includes(deferContext)
      ? [deferContext, ...locations]
      : locations;

  // The header edits, folded into every action's commit so title/notes and
  // the full Context trio (time/energy/location) are saved whatever you do
  // with the item.
  const edited = () => ({
    title: deferTitle.trim() || task.title,
    link: link.trim() || null,
    notes: notes.trim() === "" ? null : notes,
    context: deferContext.trim() || null,
    estimated_minutes: deferMinutes ? Number(deferMinutes) : null,
    energy_level: deferEnergy || null,
  });

  const buttonBase =
    "rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50";
  const neutralButton = `${buttonBase} border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center gap-4 text-xs text-zinc-500">
        {/* #141: the "N left" line is now a thin filling progress bar. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={queue.length}
            aria-valuenow={processed}
            aria-label="Inbox items clarified"
            className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          >
            <div
              className="h-full rounded-full bg-emerald-500 motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out"
              style={{ width: `${(processed / queue.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0">{remaining} left</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={skip} disabled={blocked} className="underline">
            Skip for now
          </button>
          <button onClick={onExit} disabled={blocked} className="underline">
            Exit
          </button>
        </div>
      </div>

      {/* #141: keyed on the task id so each card mounts sliding in from the
          right; transitionCard flags the old one to slide out left first. */}
      <div key={task.id} className={cardLeaving ? "clarify-card-leave" : "clarify-card-enter"}>

      {actionError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {actionError}
        </p>
      )}

      {/* Persistent editable header — available under every action panel. */}
      <div className="space-y-2">
        <input
          value={deferTitle}
          onChange={(e) => setDeferTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-base font-medium dark:border-zinc-700 dark:bg-zinc-900"
        />
        {looksLikeTopic(deferTitle) && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{TOPIC_NUDGE}</p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link (optional)"
            type="url"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {link.trim() && (
            <a
              href={link.trim()}
              target="_blank"
              rel="noreferrer"
              title="Open link"
              className="shrink-0 text-sm text-blue-600 underline dark:text-blue-400"
            >
              Open ↗
            </a>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {/* The full Context trio — same three dropdowns as the task edit form. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Context:</span>
          <select
            value={minutesToBucketValue(deferMinutes ? Number(deferMinutes) : null)}
            onChange={(e) => setDeferMinutes(e.target.value)}
            title="Time available / how long it takes"
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Time…</option>
            {TIME_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={deferEnergy}
            onChange={(e) => setDeferEnergy(e.target.value as TaskEnergy | "")}
            title="Energy required"
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Energy…</option>
            <option value="low">Low energy</option>
            <option value="medium">Medium energy</option>
            <option value="high">High energy</option>
          </select>
          <select
            value={deferContext}
            onChange={(e) => setDeferContext(e.target.value)}
            title="Location — where / with what you can do it"
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Location…</option>
            {locationOptions.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
      </div>

      {panel === "decide" && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Actionable?
            </p>
            <button disabled={blocked} onClick={() => setPanel("timer")} className={`${neutralButton} block w-full`}>
              ⚡ Do it now <span className="text-zinc-500">— under 2 minutes</span>
            </button>
            <button disabled={blocked} onClick={() => setPanel("defer")} className={`${neutralButton} block w-full`}>
              📋 Defer it <span className="text-zinc-500">— decide the next action</span>
            </button>
            <button disabled={blocked} onClick={() => setPanel("delegate")} className={`${neutralButton} block w-full`}>
              🤝 Delegate it <span className="text-zinc-500">— hand off, track in Waiting For</span>
            </button>
            <button
              disabled={blocked}
              onClick={() => setPanel("projdomain")}
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
              disabled={blocked}
              onClick={() => act(() => onTrash(task.id))}
              className={`${neutralButton} block w-full`}
            >
              🗑️ Trash it <span className="text-zinc-500">— recoverable for 30 days</span>
            </button>
            <button
              disabled={blocked}
              onClick={() => act(() => onUpdate(task.id, { ...edited(), someday: true }))}
              className={`${neutralButton} block w-full`}
            >
              📦 Someday / Maybe <span className="text-zinc-500">— might do it, not now</span>
            </button>
            <button disabled={blocked} onClick={() => setPanel("tickler")} className={`${neutralButton} block w-full`}>
              🔔 Tickler <span className="text-zinc-500">— resurface on a date</span>
            </button>
            <button
              disabled={blocked}
              onClick={() =>
                act(async () => {
                  if (!(await onUpdate(task.id, edited()))) return false;
                  return onConvertToReference(task.id);
                })
              }
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
              disabled={blocked}
              onClick={() =>
                act(async () => {
                  if (!(await onUpdate(task.id, edited()))) return false;
                  return onToggleDone(task);
                })
              }
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              ✓ Did it
            </button>
            <button
              disabled={blocked}
              onClick={() => setPanel("defer")}
              className={neutralButton}
            >
              Longer than I thought — defer
            </button>
            <button disabled={blocked} onClick={() => setPanel("decide")} className={neutralButton}>
              Back
            </button>
          </div>
        </div>
      )}

      {panel === "defer" && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-zinc-500">
            Make sure the title reads as the very next physical action (edit it above), then file it:
          </p>
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
              Priority
              <select
                value={deferPriority}
                onChange={(e) => setDeferPriority(e.target.value as TaskPriority)}
                className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {PRIORITIES.map((p) => (
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
              disabled={blocked || !deferTitle.trim()}
              onClick={() =>
                act(() =>
                  onUpdate(task.id, {
                    ...edited(),
                    domain_id: deferDomain || null,
                    project_id: deferProject || null,
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
            <button disabled={blocked} onClick={() => setPanel("decide")} className={neutralButton}>
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
              disabled={blocked}
              onClick={() =>
                act(() =>
                  onUpdate(task.id, {
                    ...edited(),
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
            <button disabled={blocked} onClick={() => setPanel("decide")} className={neutralButton}>
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
              disabled={blocked || !ticklerDate}
              onClick={() => act(() => onUpdate(task.id, { ...edited(), someday: true, revisit_date: ticklerDate }))}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save & next
            </button>
            <button disabled={blocked} onClick={() => setPanel("decide")} className={neutralButton}>
              Back
            </button>
          </div>
        </div>
      )}

      {panel === "projdomain" && (
        <div className="mt-4 space-y-2">
          <label className="block text-xs text-zinc-500">
            Which domain does this project live under? <span className="text-red-500">*</span>
            <select
              value={projectDomain}
              onChange={(e) => setProjectDomain(e.target.value)}
              className="mt-1 block rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Choose a domain…</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-zinc-500">
            Required — a project needs a domain to show up in your sidebar.
          </p>
          <div className="flex gap-2">
            <button
              disabled={blocked || !projectDomain}
              onClick={async () => {
                setBusy(true);
                setActionError(null);
                try {
                  // File the task under the chosen domain (plus any header
                  // edits), then convert — so the new project is never
                  // domain-less and invisible. Either step failing must say
                  // so (#118): a silent no-op left the flow stuck here.
                  if (!(await onUpdate(task.id, { ...edited(), domain_id: projectDomain }))) {
                    setActionError(ACTION_FAILED);
                    return;
                  }
                  const project = await onConvertToProject(task.id);
                  if (!project) {
                    setActionError(ACTION_FAILED);
                    return;
                  }
                  setNewProject(project);
                  setPanel("project");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Create project
            </button>
            <button disabled={blocked} onClick={() => setPanel("decide")} className={neutralButton}>
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
              disabled={blocked || !nextAction.trim()}
              onClick={() =>
                act(async () => {
                  if (!newProject) return true;
                  return onCreateTask({
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
            <button disabled={blocked} onClick={advance} className={neutralButton}>
              Skip — I&apos;ll plan it later
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
