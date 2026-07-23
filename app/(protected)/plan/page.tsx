"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { looksLikeTopic, TOPIC_NUDGE } from "@/lib/tasks/next-action-shape";

// Allen's Natural Planning Model as a guided flow — the way brains actually
// plan (why → what wild success looks like → mind-dump → structure → move),
// pointed at one project. The three thinking phases write straight to the
// project's existing purpose/outcome_vision/brainstorm fields; the last
// phase creates real next-action tasks. Reached from a project card's
// "Plan" button or a stalled project in the Weekly Review.

type Project = {
  id: string;
  name: string;
  domain_id: string | null;
  purpose: string | null;
  outcome_vision: string | null;
  brainstorm: string | null;
};

const PHASES = [
  {
    key: "purpose",
    title: "1 · Purpose & principles",
    prompt:
      "Why does this project exist at all? What would make you drop it? If the why is fuzzy, everything downstream wobbles.",
    placeholder: "This matters because…",
  },
  {
    key: "outcome_vision",
    title: "2 · Outcome vision",
    prompt:
      "Wild success, in the past tense: it's done — what do you see? Be concrete enough that you'd recognize \"done\" on sight.",
    placeholder: "It's finished. What I see is…",
  },
  {
    key: "brainstorm",
    title: "3 · Brainstorm",
    prompt:
      "Empty the head — ideas, worries, half-thoughts, people to ask, things to buy. No organizing, no judging. Quantity now, quality later.",
    placeholder: "Everything, in any order…",
  },
] as const;

function PlanFlow() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  const [project, setProject] = useState<Project | null>(null);
  // No project param = nothing to load — start settled instead of flipping
  // state synchronously inside the effect.
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0-2 = thinking phases, 3 = organize, 4 = next actions, 5 = done
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [nextAction, setNextAction] = useState("");
  const [addedActions, setAddedActions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Project not found"))))
      .then((data: Project) => {
        setProject(data);
        setDrafts({
          purpose: data.purpose ?? "",
          outcome_vision: data.outcome_vision ?? "",
          brainstorm: data.brainstorm ?? "",
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectId]);

  async function saveField(key: string) {
    if (!project) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: drafts[key] ?? "" }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save");
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function addNextAction() {
    if (!project || !nextAction.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextAction.trim(),
          project_id: project.id,
          domain_id: project.domain_id ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to add task");
        return;
      }
      setAddedActions((prev) => [...prev, nextAction.trim()]);
      setNextAction("");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  if (!projectId || !project) {
    return (
      <>
        <p className="text-sm text-zinc-500">
          {error ?? "Pick a project to plan — open one from the Projects page."}
        </p>
        <Link
          href="/projects"
          className="mt-3 inline-block text-sm text-blue-600 underline dark:text-blue-400"
        >
          🗂️ Open Projects →
        </Link>
      </>
    );
  }

  const thinkingPhase = step <= 2 ? PHASES[step] : null;

  return (
    <>
      <p className="mb-6 text-sm text-zinc-500">
        Planning <span className="font-medium text-zinc-900 dark:text-zinc-100">{project.name}</span>{" "}
        the way brains naturally plan: why → what → everything → structure → move.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        {thinkingPhase && (
          <>
            <p className="text-lg font-medium">{thinkingPhase.title}</p>
            <p className="mt-1 text-sm text-zinc-500">{thinkingPhase.prompt}</p>
            <textarea
              value={drafts[thinkingPhase.key] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [thinkingPhase.key]: e.target.value }))}
              placeholder={thinkingPhase.placeholder}
              rows={6}
              className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy}
                onClick={async () => {
                  if (await saveField(thinkingPhase.key)) setStep(step + 1);
                }}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save & next
              </button>
              {step > 0 && (
                <button
                  disabled={busy}
                  onClick={() => setStep(step - 1)}
                  className="text-sm text-zinc-500 underline"
                >
                  Back
                </button>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-lg font-medium">4 · Organize</p>
            <p className="mt-1 text-sm text-zinc-500">
              Read your brainstorm back. What are the natural components, sequences,
              priorities? Big chunks can become subprojects; reference material can go to the
              Library. You don&apos;t have to structure everything — just enough to see the
              path.
            </p>
            {drafts.brainstorm && (
              <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/60">
                <p className="text-xs font-semibold text-zinc-400 uppercase">Your brainstorm</p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  {drafts.brainstorm}
                </p>
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              Need a subproject? Create it from the{" "}
              <Link href="/projects" className="underline">
                Projects page
              </Link>{" "}
              with this project as its parent.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setStep(4)}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Next — next actions
              </button>
              <button onClick={() => setStep(2)} className="text-sm text-zinc-500 underline">
                Back
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-lg font-medium">5 · Next actions</p>
            <p className="mt-1 text-sm text-zinc-500">
              The payoff: what&apos;s the very next physical action? Add as many as are truly
              parallel — but at least one, or the plan is a wish.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNextAction();
                  }
                }}
                placeholder='e.g. "Email Sarah for the venue shortlist"'
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                disabled={busy || !nextAction.trim()}
                onClick={addNextAction}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
              >
                Add
              </button>
            </div>
            {looksLikeTopic(nextAction) && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{TOPIC_NUDGE}</p>
            )}
            {addedActions.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {addedActions.map((title, i) => (
                  <li key={i} className="text-xs text-zinc-500">
                    ✓ {title}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <button
                disabled={addedActions.length === 0}
                onClick={() => setStep(5)}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                title={addedActions.length === 0 ? "At least one next action — or the plan is a wish" : undefined}
              >
                Finish planning
              </button>
              <button onClick={() => setStep(3)} className="text-sm text-zinc-500 underline">
                Back
              </button>
            </div>
          </>
        )}

        {step === 5 && (
          <div className="p-4 text-center">
            <p className="text-3xl">🧭</p>
            <p className="mt-2 text-lg font-semibold">Planned</p>
            <p className="mt-1 text-sm text-zinc-500">
              Purpose, vision, brainstorm captured — and {addedActions.length} next action
              {addedActions.length === 1 ? "" : "s"} ready to move on.
            </p>
            <Link
              href={`/tasks?project=${project.id}`}
              className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Open the project →
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export default function PlanPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-1 text-2xl font-semibold">🧭 Project Planning</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <PlanFlow />
      </Suspense>
    </div>
  );
}
