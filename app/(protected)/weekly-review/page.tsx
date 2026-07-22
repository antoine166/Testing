"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { findStalledProjectIds } from "@/lib/projects/stalled";
import { todayLocal } from "@/lib/date";

// GTD's Weekly Review as a guided, no-AI flow: Get Clear → Get Current →
// Get Creative, one step at a time, with the app's real numbers surfaced at
// each step so the review is about *your actual system*, not a generic
// checklist. Replaced the old Coach-driven review (the in-app AI Coach was
// removed — Claude access continues via the MCP connector instead).

type Task = {
  id: string;
  title: string;
  status: string;
  domain_id: string | null;
  project_id: string | null;
  someday: boolean;
  waiting_for: boolean;
  waiting_on: string | null;
  follow_up_date: string | null;
  revisit_date: string | null;
  scheduled_date: string | null;
};

type Project = {
  id: string;
  name: string;
  status: string;
  parent_project_id: string | null;
};

type Horizons = { goals: string; vision: string; purpose: string };

export default function WeeklyReviewPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [horizons, setHorizons] = useState<Horizons | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const today = todayLocal();

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/tasks", { signal: controller.signal }),
      fetch("/api/projects", { signal: controller.signal }),
      fetch("/api/horizons", { signal: controller.signal }),
    ])
      .then(async ([tasksRes, projectsRes, horizonsRes]) => {
        if (!tasksRes.ok || !projectsRes.ok) throw new Error("Failed to load review data");
        return Promise.all([
          tasksRes.json(),
          projectsRes.json(),
          horizonsRes.ok ? horizonsRes.json() : null,
        ]);
      })
      .then(([tasksData, projectsData, horizonsData]: [Task[], Project[], Horizons | null]) => {
        setTasks(tasksData);
        setProjects(projectsData);
        setHorizons(horizonsData);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const open = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const inboxCount = open.filter((t) => !t.domain_id && !t.someday && !t.waiting_for).length;
  const waiting = open.filter((t) => t.waiting_for);
  const dueFollowUps = waiting.filter((t) => t.follow_up_date && t.follow_up_date <= today);
  const somedayTasks = open.filter((t) => t.someday);
  const readyToRevisit = somedayTasks.filter((t) => t.revisit_date && t.revisit_date <= today);
  const activeProjects = projects.filter((p) => p.status === "active");
  const stalledIds = useMemo(
    () =>
      findStalledProjectIds(
        projects,
        open.map((t) => ({ project_id: t.project_id, status: t.status })),
      ),
    [projects, open],
  );
  const stalledProjects = activeProjects.filter((p) => stalledIds.has(p.id));
  const anytimeCount = open.filter(
    (t) => t.domain_id && !t.someday && !t.waiting_for && !t.scheduled_date,
  ).length;

  const steps: { phase: string; title: string; body: React.ReactNode }[] = [
    {
      phase: "Get Clear",
      title: "Empty your head",
      body: (
        <>
          <p className="text-sm text-zinc-500">
            Sweep everything that has your attention into the Inbox — loose notes, open
            browser tabs, things people said to you this week. Don&apos;t organize, just
            capture.
          </p>
          <Link href="/inbox" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
            🧠 Run a Mind Sweep →
          </Link>
        </>
      ),
    },
    {
      phase: "Get Clear",
      title: "Get the Inbox to zero",
      body: (
        <>
          <p className="text-sm">
            {inboxCount === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ Inbox is already at zero.
              </span>
            ) : (
              <>
                <span className="font-semibold">{inboxCount}</span> unprocessed item
                {inboxCount === 1 ? "" : "s"} waiting.
              </>
            )}
          </p>
          {inboxCount > 0 && (
            <Link href="/inbox" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
              ⚡ Clarify them →
            </Link>
          )}
        </>
      ),
    },
    {
      phase: "Get Current",
      title: "Review the calendar",
      body: (
        <>
          <p className="text-sm text-zinc-500">
            Look <em>back</em> two weeks for loose ends (follow-ups you owe, notes you never
            captured), then <em>ahead</em> for anything that needs preparing.
          </p>
          <Link href="/calendar" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
            🗓️ Open the calendar →
          </Link>
        </>
      ),
    },
    {
      phase: "Get Current",
      title: "Review next-action lists",
      body: (
        <>
          <p className="text-sm">
            <span className="font-semibold">{anytimeCount}</span> action
            {anytimeCount === 1 ? "" : "s"} on your Anytime lists. Mark off anything done,
            delete anything dead, rephrase anything you&apos;ve been avoiding (it&apos;s
            usually not really the next physical action).
          </p>
          <Link href="/anytime" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
            📚 Open Anytime →
          </Link>
        </>
      ),
    },
    {
      phase: "Get Current",
      title: "Review Waiting For",
      body: (
        <>
          <p className="text-sm">
            <span className="font-semibold">{waiting.length}</span> item
            {waiting.length === 1 ? "" : "s"} out with other people
            {dueFollowUps.length > 0 && (
              <>
                {" — "}
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {dueFollowUps.length} due a follow-up now
                </span>
              </>
            )}
            .
          </p>
          {dueFollowUps.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {dueFollowUps.slice(0, 5).map((t) => (
                <li key={t.id} className="text-sm text-zinc-500">
                  🔔 {t.title}
                  {t.waiting_on ? ` (${t.waiting_on})` : ""}
                </li>
              ))}
            </ul>
          )}
          <Link href="/waiting-for" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
            ⏳ Open Waiting For →
          </Link>
        </>
      ),
    },
    {
      phase: "Get Current",
      title: "Every project has a next action",
      body: (
        <>
          <p className="text-sm">
            {stalledProjects.length === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ All {activeProjects.length} active projects have a next action.
              </span>
            ) : (
              <>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {stalledProjects.length} stalled
                </span>{" "}
                (no next action) out of {activeProjects.length} active:
              </>
            )}
          </p>
          {stalledProjects.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {stalledProjects.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link
                    href={`/tasks?project=${p.id}`}
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    ⚠ {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/projects" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
            🗂️ Open Projects →
          </Link>
        </>
      ),
    },
    {
      phase: "Get Creative",
      title: "Review Someday / Maybe",
      body: (
        <>
          <p className="text-sm">
            <span className="font-semibold">{somedayTasks.length}</span> item
            {somedayTasks.length === 1 ? "" : "s"} incubating
            {readyToRevisit.length > 0 && (
              <>
                {" — "}
                <span className="font-semibold">{readyToRevisit.length} ready to revisit</span>
              </>
            )}
            . Anything whose time has come? Anything to delete without guilt?
          </p>
          <Link href="/someday" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
            📦 Open Someday / Tickler →
          </Link>
        </>
      ),
    },
    {
      phase: "Get Creative",
      title: "Look up at the horizons",
      body: (
        <>
          <p className="text-sm text-zinc-500">
            Reread your goals, vision, and purpose. Do this week&apos;s projects actually
            serve them? Anything new they suggest?
          </p>
          {horizons && (horizons.goals || horizons.vision || horizons.purpose) && (
            <details className="mt-2 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/60">
              <summary className="cursor-pointer text-sm font-medium">Your horizons</summary>
              {horizons.goals && (
                <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold">Goals:</span> {horizons.goals}
                </p>
              )}
              {horizons.vision && (
                <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold">Vision:</span> {horizons.vision}
                </p>
              )}
              {horizons.purpose && (
                <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold">Purpose:</span> {horizons.purpose}
                </p>
              )}
            </details>
          )}
          <Link href="/horizons" className="mt-2 inline-block text-sm text-blue-600 underline dark:text-blue-400">
            🔭 Open Horizons →
          </Link>
        </>
      ),
    },
    {
      phase: "Get Creative",
      title: "Capture any new ideas",
      body: (
        <p className="text-sm text-zinc-500">
          Anything this review shook loose — a project to start, someone to reach out to, a
          bold idea? Hit <kbd className="rounded border border-zinc-300 px-1 dark:border-zinc-700">C</kbd>{" "}
          for Quick Capture before you close this out.
        </p>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  const current = steps[step];

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-1 text-2xl font-semibold">🔭 Weekly Review</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Get Clear → Get Current → Get Creative. Half an hour that makes the whole system
        trustworthy for another week.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {step >= steps.length ? (
        <div className="rounded-xl border border-zinc-200 p-8 text-center dark:border-zinc-800">
          <p className="text-3xl">🎉</p>
          <p className="mt-2 text-lg font-semibold">Review complete</p>
          <p className="mt-1 text-sm text-zinc-500">
            The system is current. See you next week.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Back to Today
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
            <span>
              {current.phase} · step {step + 1} of {steps.length}
            </span>
            <div className="flex gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="underline">
                  Back
                </button>
              )}
              <Link href="/" className="underline">
                Exit
              </Link>
            </div>
          </div>
          <p className="text-lg font-medium">{current.title}</p>
          <div className="mt-2">{current.body}</div>
          <button
            onClick={() => setStep(step + 1)}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {step === steps.length - 1 ? "Finish review" : "Done — next step"}
          </button>
        </div>
      )}
    </div>
  );
}
