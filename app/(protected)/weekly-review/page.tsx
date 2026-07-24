"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { findStalledProjectIds } from "@/lib/projects/stalled";
import { looksLikeTopic } from "@/lib/tasks/next-action-shape";
import { reviewStreakWeeks } from "@/lib/reviews/streak";
import { todayLocal, daysSince } from "@/lib/date";

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
  completed_at: string | null;
};

type Project = {
  id: string;
  name: string;
  status: string;
  parent_project_id: string | null;
  domain_id: string | null;
  review_every_days: number | null;
  last_reviewed_at: string | null;
};

type Domain = { id: string; name: string; color: string };

type Horizons = { goals: string; vision: string; purpose: string };

type ReviewLog = { id: string; completed_at: string };

export default function WeeklyReviewPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [horizons, setHorizons] = useState<Horizons | null>(null);
  const [reviewLogs, setReviewLogs] = useState<ReviewLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [logged, setLogged] = useState(false);
  const [reviewedNow, setReviewedNow] = useState<Set<string>>(new Set());
  const today = todayLocal();

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/tasks", { signal: controller.signal }),
      fetch("/api/projects", { signal: controller.signal }),
      fetch("/api/horizons", { signal: controller.signal }),
      fetch("/api/domains", { signal: controller.signal }),
      fetch("/api/weekly-review-logs", { signal: controller.signal }),
    ])
      .then(async ([tasksRes, projectsRes, horizonsRes, domainsRes, logsRes]) => {
        if (!tasksRes.ok || !projectsRes.ok || !domainsRes.ok)
          throw new Error("Failed to load review data");
        return Promise.all([
          tasksRes.json(),
          projectsRes.json(),
          horizonsRes.ok ? horizonsRes.json() : null,
          domainsRes.json(),
          logsRes.ok ? logsRes.json() : [],
        ]);
      })
      .then(
        ([tasksData, projectsData, horizonsData, domainsData, logsData]: [
          Task[],
          Project[],
          Horizons | null,
          Domain[],
          ReviewLog[],
        ]) => {
          setTasks(tasksData);
          setProjects(projectsData);
          setHorizons(horizonsData);
          setDomains(domainsData);
          setReviewLogs(logsData);
        },
      )
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
  // Processed tasks whose titles still read as topics ("Mom", "taxes") —
  // they left the Inbox without the clarify question really being answered.
  const topicShaped = open.filter(
    (t) => t.domain_id && !t.someday && !t.waiting_for && looksLikeTopic(t.title),
  );

  // Per-project review cadence: no cadence set = due at every review (the
  // safe default) — but "reviewed today" always counts as done, or the
  // Mark-reviewed button would appear to do nothing (a no-cadence project
  // would stay "due" forever). Cadence of N days = due once last review is
  // N+ days old.
  const isDueForReview = (p: Project) =>
    !p.last_reviewed_at ||
    daysSince(p.last_reviewed_at.slice(0, 10)) >= (p.review_every_days ?? 1);
  const dueForReview = activeProjects.filter(isDueForReview);
  // Marked during this session — kept visible with a ✓ instead of silently
  // dropping out of the list, so the click has obvious feedback.
  const reviewStepProjects = activeProjects.filter(
    (p) => isDueForReview(p) || reviewedNow.has(p.id),
  );

  // Areas of Focus health (Horizon 2): a domain with no next actions or no
  // recent completions is going cold — exactly what a review should catch.
  const domainHealth = domains
    .map((d) => {
      const domainProjects = activeProjects.filter((p) => p.domain_id === d.id);
      const nextActions = open.filter(
        (t) => t.domain_id === d.id && !t.someday && !t.waiting_for,
      ).length;
      const doneDates = tasks
        .filter((t) => t.domain_id === d.id && t.status === "done" && t.completed_at)
        .map((t) => t.completed_at!.slice(0, 10));
      const lastDone = doneDates.length ? doneDates.sort().at(-1)! : null;
      const daysQuiet = lastDone ? daysSince(lastDone) : null;
      return {
        ...d,
        projectCount: domainProjects.length,
        nextActions,
        daysQuiet,
        cold: nextActions === 0 || daysQuiet === null || daysQuiet >= 14,
      };
    })
    .sort((a, b) => {
      if (a.cold !== b.cold) return a.cold ? -1 : 1; // cold areas first
      const aQuiet = a.daysQuiet ?? 9999; // never-completed sorts quietest
      const bQuiet = b.daysQuiet ?? 9999;
      return bQuiet - aQuiet;
    });

  const lastReview = reviewLogs[0]?.completed_at ?? null;
  const streak = reviewStreakWeeks(
    reviewLogs.map((l) => l.completed_at),
    today,
  );
  // What the streak reads as once today's review is in the books — shown on
  // the completion screen without waiting for a refetch of the log just
  // POSTed.
  const streakIncludingToday = reviewStreakWeeks(
    [...reviewLogs.map((l) => l.completed_at), `${today}T12:00:00`],
    today,
  );

  async function markProjectReviewed(id: string) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_reviewed: true }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to mark reviewed");
      return;
    }
    const updated = await res.json();
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    setReviewedNow((prev) => new Set(prev).add(id));
  }

  // The review only counts if it's recorded — the keystone habit gets the
  // same treatment as every other habit in the app. Logged once per visit,
  // when "Finish review" is clicked on the last step.
  async function finishReview() {
    setStep(steps.length);
    if (logged) return;
    setLogged(true);
    await fetch("/api/weekly-review-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stats: {
          inbox_count: inboxCount,
          stalled_count: stalledProjects.length,
          topic_shaped_count: topicShaped.length,
          waiting_count: waiting.length,
          due_follow_ups: dueFollowUps.length,
          someday_count: somedayTasks.length,
          projects_due_for_review: dueForReview.length,
        },
      }),
    }).catch(() => {
      // Logging is bookkeeping — a failed POST shouldn't block the
      // completion screen. The streak just won't advance this once.
    });
  }

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
      title: "Make fuzzy actions physical",
      body: (
        <>
          <p className="text-sm">
            {topicShaped.length === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ Every next action reads like an action.
              </span>
            ) : (
              <>
                <span className="font-semibold">{topicShaped.length}</span> task
                {topicShaped.length === 1 ? "" : "s"} still read{topicShaped.length === 1 ? "s" : ""} like a{" "}
                <em>topic</em>, not a physical next action. &ldquo;Mom&rdquo; isn&apos;t doable —
                &ldquo;Call Mom about Thanksgiving&rdquo; is. Rewrite each so it starts with a
                visible verb.
              </>
            )}
          </p>
          {topicShaped.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {topicShaped.slice(0, 8).map((t) => (
                <li key={t.id} className="text-sm text-zinc-500">
                  <Link
                    href={`/tasks?q=${encodeURIComponent(t.title)}`}
                    className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {t.title}
                  </Link>
                </li>
              ))}
              {topicShaped.length > 8 && (
                <li className="text-sm text-zinc-500">…and {topicShaped.length - 8} more.</li>
              )}
            </ul>
          )}
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
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <Link
                    href={`/tasks?project=${p.id}`}
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    ⚠ {p.name}
                  </Link>
                  <Link
                    href={`/plan?project=${p.id}`}
                    className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    🧭 Plan it
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
      phase: "Get Current",
      title: "Project-by-project review",
      body: (
        <>
          <p className="text-sm">
            {dueForReview.length === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ All {activeProjects.length} active projects reviewed — nothing left due.
              </span>
            ) : (
              <>
                <span className="font-semibold">{dueForReview.length}</span> of{" "}
                {activeProjects.length} active projects due for a look. For each: still worth
                doing? Outcome still right? Next action still the next action? Then mark it
                reviewed.
              </>
            )}
          </p>
          {reviewStepProjects.length > 0 && (
            <ul className="mt-1 space-y-1">
              {reviewStepProjects.map((p) => {
                const done = !isDueForReview(p);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/tasks?project=${p.id}`}
                      className={`truncate underline ${
                        done
                          ? "text-zinc-400 dark:text-zinc-600"
                          : "text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      {p.name}
                    </Link>
                    {done ? (
                      <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        ✓ Reviewed
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markProjectReviewed(p.id)}
                        className="shrink-0 text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        Mark reviewed ✓
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Stable projects can step back — set &ldquo;review every N days&rdquo; on a
            project&apos;s edit form and it&apos;ll only appear here when due.
          </p>
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
      title: "Check your Areas of Focus",
      body: (
        <>
          <p className="text-sm text-zinc-500">
            Horizon 2: is any life area quietly going cold? A domain with no next actions —
            or nothing finished in weeks — is drifting, whether or not it feels that way.
          </p>
          {domainHealth.length > 0 && (
            <ul className="mt-2 space-y-1">
              {domainHealth.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <Link
                    href={`/tasks?domain=${d.id}`}
                    className="truncate underline hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {d.name}
                  </Link>
                  <span className="ml-auto shrink-0 text-xs text-zinc-500">
                    {d.projectCount} project{d.projectCount === 1 ? "" : "s"} ·{" "}
                    {d.nextActions} action{d.nextActions === 1 ? "" : "s"}
                    {" · "}
                    {d.daysQuiet === null
                      ? "nothing finished yet"
                      : d.daysQuiet === 0
                        ? "active today"
                        : `quiet ${d.daysQuiet}d`}
                    {d.cold && <span className="ml-1 text-amber-600 dark:text-amber-400">🥶</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
      <p className="mb-1 text-sm text-zinc-500">
        Get Clear → Get Current → Get Creative. Half an hour that makes the whole system
        trustworthy for another week.
      </p>
      <p className="mb-6 text-xs text-zinc-500">
        {lastReview ? (
          <>
            {streak > 0 && <>🔥 {streak}-week streak · </>}
            Last review{" "}
            {daysSince(lastReview.slice(0, 10)) === 0
              ? "today"
              : `${daysSince(lastReview.slice(0, 10))} day${daysSince(lastReview.slice(0, 10)) === 1 ? "" : "s"} ago`}
          </>
        ) : (
          <>First review — this one starts the streak.</>
        )}
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
            The system is current. That&apos;s a {streakIncludingToday}-week streak. See you
            next week.
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
            onClick={() => (step === steps.length - 1 ? finishReview() : setStep(step + 1))}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {step === steps.length - 1 ? "Finish review" : "Done — next step"}
          </button>
        </div>
      )}
    </div>
  );
}
