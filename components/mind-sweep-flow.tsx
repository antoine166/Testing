"use client";

import { useState, type FormEvent } from "react";
import type { Task } from "@/components/task-row";

// GTD's mind sweep: Allen's "incompletion trigger lists" condensed into a
// guided pass. One trigger at a time, a rapid-capture box under each —
// everything lands in the Inbox as-is (capture, don't clarify: judging or
// organizing mid-sweep is exactly what Allen says not to do). The natural
// next step afterward is the Clarify flow, which the end screen offers.
const TRIGGERS: { category: string; prompt: string; examples: string }[] = [
  {
    category: "Professional",
    prompt: "Projects started but not completed",
    examples: "anything you've begun and left hanging — client work, programs, content",
  },
  {
    category: "Professional",
    prompt: "Promises you've made to other people",
    examples: "clients, athletes, business partners, colleagues — anything they're expecting",
  },
  {
    category: "Professional",
    prompt: "Communications you need to make or get",
    examples: "calls to make, emails/texts to send, replies you owe",
  },
  {
    category: "Professional",
    prompt: "Writing to start or finish",
    examples: "posts, programs, proposals, check-in write-ups, curriculum",
  },
  {
    category: "Professional",
    prompt: "Meetings or calls that need to be set or prepped",
    examples: "sessions to schedule, agendas to prepare, follow-ups to book",
  },
  {
    category: "Professional",
    prompt: "Money — in and out",
    examples: "invoices to send, payments to chase, expenses, subscriptions, pricing",
  },
  {
    category: "Professional",
    prompt: "Planning and marketing",
    examples: "launches, promotions, the website, content calendar, upcoming events",
  },
  {
    category: "Professional",
    prompt: "Skills and things to learn",
    examples: "certifications, courses, techniques you've been meaning to study",
  },
  {
    category: "Professional",
    prompt: "Tools and systems that need attention",
    examples: "software, equipment, templates, anything broken or clunky",
  },
  {
    category: "Professional",
    prompt: "Things you're waiting on from others",
    examples: "delegated work, replies, deliveries, approvals",
  },
  {
    category: "Personal",
    prompt: "Family and relationships",
    examples: "commitments made, calls owed, occasions coming up, time to plan",
  },
  {
    category: "Personal",
    prompt: "Home — repairs, maintenance, stuff",
    examples: "things to fix, organize, replace, return, or buy",
  },
  {
    category: "Personal",
    prompt: "Health and training",
    examples: "appointments to book, checkups due, your own training commitments",
  },
  {
    category: "Personal",
    prompt: "Personal finances",
    examples: "bills, taxes, insurance, investments, subscriptions to cancel",
  },
  {
    category: "Personal",
    prompt: "Errands",
    examples: "things to buy, pick up, drop off, return",
  },
  {
    category: "Personal",
    prompt: "Community and commitments outside work",
    examples: "groups, volunteering, favors promised",
  },
  {
    category: "Personal",
    prompt: "Fun, trips, and creative projects",
    examples: "trips to plan, experiences, hobbies, books, things you keep postponing",
  },
  {
    category: "Wrap-up",
    prompt: "Anything else on your mind?",
    examples: "big or small, vague or clear — if it has your attention, capture it",
  },
];

export default function MindSweepFlow({
  onCreateTask,
  onStartClarify,
  onExit,
}: {
  onCreateTask: (input: Record<string, unknown>) => Promise<Task | null>;
  onStartClarify: () => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [captured, setCaptured] = useState<string[]>([]);
  const [capturedThisPrompt, setCapturedThisPrompt] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const trigger = TRIGGERS[index];
  const done = index >= TRIGGERS.length;

  async function handleCapture(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const created = await onCreateTask({ title });
      if (created) {
        setCaptured((prev) => [...prev, title]);
        setCapturedThisPrompt((prev) => [...prev, title]);
        setDraft("");
      }
    } finally {
      setBusy(false);
    }
  }

  function advance(step: number) {
    const next = Math.max(0, index + step);
    setIndex(next);
    setCapturedThisPrompt([]);
    setDraft("");
  }

  if (done) {
    return (
      <div className="rounded-xl border border-zinc-200 p-8 text-center dark:border-zinc-800">
        <p className="text-3xl">🧠</p>
        <p className="mt-2 text-lg font-semibold">Mind swept</p>
        <p className="mt-1 text-sm text-zinc-500">
          {captured.length} item{captured.length === 1 ? "" : "s"} captured to the Inbox.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {captured.length > 0 && (
            <button
              onClick={onStartClarify}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              ⚡ Clarify them now
            </button>
          )}
          <button
            onClick={onExit}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          Mind Sweep · {index + 1} of {TRIGGERS.length} · {trigger.category}
        </span>
        <div className="flex gap-2">
          {index > 0 && (
            <button onClick={() => advance(-1)} className="underline">
              Back
            </button>
          )}
          <button onClick={onExit} className="underline">
            Exit
          </button>
        </div>
      </div>

      <p className="text-lg font-medium">{trigger.prompt}</p>
      <p className="mt-1 text-sm text-zinc-500">{trigger.examples}</p>

      <form onSubmit={handleCapture} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type it and hit Enter — don't organize, just capture"
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add
        </button>
      </form>

      {capturedThisPrompt.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {capturedThisPrompt.map((title, i) => (
            <li key={i} className="text-sm text-zinc-500">
              ✓ {title}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {captured.length} captured so far
        </span>
        <button
          onClick={() => advance(1)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {capturedThisPrompt.length > 0 ? "Next trigger →" : "Nothing here — next →"}
        </button>
      </div>
    </div>
  );
}
