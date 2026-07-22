"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

// One box, the whole brain (SCOPE.md §3.13). Results are shown with enough
// context inline (snippets, dates, status) that most lookups end here;
// links jump into the owning list for anything that needs acting on.

type SearchResults = {
  query: string;
  tasks: {
    id: string;
    title: string;
    notes: string | null;
    status: string;
    someday: boolean;
    waiting_for: boolean;
    scheduled_date: string | null;
    due_date: string | null;
    completed_at: string | null;
  }[];
  projects: { id: string; name: string; description: string | null; status: string }[];
  knowledge_items: { id: string; title: string; content: string | null; url: string | null; type: string }[];
  tickler_items: { id: string; note: string; revisit_date: string }[];
  agenda_items: { id: string; person_name: string; note: string; done: boolean }[];
};

function snippet(text: string | null, q: string, len = 120): string | null {
  if (!text) return null;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.length > len ? `${text.slice(0, len)}…` : text;
  const start = Math.max(0, idx - 40);
  const chunk = text.slice(start, start + len);
  return `${start > 0 ? "…" : ""}${chunk}${start + len < text.length ? "…" : ""}`;
}

/** Where a task actually lives, so the link lands on the list that shows it. */
function taskHome(t: SearchResults["tasks"][number]): { href: string; label: string } {
  if (t.status === "done") return { href: "/logbook", label: "Logbook" };
  if (t.someday) return { href: "/someday", label: "Someday" };
  if (t.waiting_for) return { href: "/waiting-for", label: "Waiting For" };
  return { href: `/tasks?q=${encodeURIComponent(t.title)}`, label: "Tasks" };
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [input, setInput] = useState(urlQuery);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Loading is derived, not stored: we're loading whenever the URL's query
  // hasn't produced matching results yet (avoids setState-in-effect).
  const loading =
    urlQuery.trim().length >= 2 && results?.query !== urlQuery.trim() && !error;

  // Re-sync the input when navigating between /search?q=X urls (same
  // adjust-during-render pattern used for the tasks page's domain filter).
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    setInput(urlQuery);
  }

  useEffect(() => {
    const q = urlQuery.trim();
    if (q.length < 2) {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Search failed"))))
      .then((data: SearchResults) => {
        setResults(data);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      });
    return () => controller.abort();
  }, [urlQuery]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (q.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const total = results
    ? results.tasks.length +
      results.projects.length +
      results.knowledge_items.length +
      results.tickler_items.length +
      results.agenda_items.length
    : 0;

  const sectionClass = "mb-6";
  const headingClass = "mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase";
  const rowClass =
    "rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-4 py-2.5";

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-4 text-2xl font-semibold">🔎 Search</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search everything — tasks, projects, notes, tickler, agendas"
          autoFocus
          className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </form>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-zinc-500">Searching…</p>}

      {!loading && results && urlQuery.trim().length >= 2 && (
        <>
          <p className="mb-4 text-sm text-zinc-500">
            {total === 0
              ? `Nothing matches “${results.query}”.`
              : `${total} result${total === 1 ? "" : "s"} for “${results.query}”`}
          </p>

          {results.tasks.length > 0 && (
            <section className={sectionClass}>
              <h2 className={headingClass}>Tasks</h2>
              <ul className="space-y-2">
                {results.tasks.map((t) => {
                  const home = taskHome(t);
                  const s = snippet(t.notes, results.query);
                  return (
                    <li key={t.id} className={rowClass}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${t.status === "done" ? "line-through opacity-60" : ""}`}
                        >
                          {t.title}
                        </span>
                        <Link
                          href={home.href}
                          className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {home.label} →
                        </Link>
                      </div>
                      {s && <p className="mt-0.5 text-xs text-zinc-500">{s}</p>}
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {t.status === "done" && t.completed_at
                          ? `completed ${t.completed_at.slice(0, 10)}`
                          : [
                              t.due_date && `due ${t.due_date}`,
                              t.scheduled_date && `scheduled ${t.scheduled_date}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {results.projects.length > 0 && (
            <section className={sectionClass}>
              <h2 className={headingClass}>Projects</h2>
              <ul className="space-y-2">
                {results.projects.map((p) => (
                  <li key={p.id} className={rowClass}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {p.name}
                        <span className="ml-2 text-xs text-zinc-400">{p.status}</span>
                      </span>
                      <Link
                        href={`/tasks?project=${p.id}`}
                        className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Open →
                      </Link>
                    </div>
                    {p.description && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {snippet(p.description, results.query)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.knowledge_items.length > 0 && (
            <section className={sectionClass}>
              <h2 className={headingClass}>Library</h2>
              <ul className="space-y-2">
                {results.knowledge_items.map((k) => (
                  <li key={k.id} className={rowClass}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">
                        {k.title}
                        <span className="ml-2 text-xs text-zinc-400">{k.type}</span>
                      </span>
                      <Link
                        href="/library"
                        className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Library →
                      </Link>
                    </div>
                    {k.content && (
                      <p className="mt-0.5 text-xs text-zinc-500">{snippet(k.content, results.query)}</p>
                    )}
                    {k.url && (
                      <a
                        href={k.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-xs text-blue-600 underline dark:text-blue-400"
                      >
                        {k.url}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.tickler_items.length > 0 && (
            <section className={sectionClass}>
              <h2 className={headingClass}>Tickler</h2>
              <ul className="space-y-2">
                {results.tickler_items.map((t) => (
                  <li key={t.id} className={rowClass}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm">{t.note}</span>
                      <Link
                        href="/someday"
                        className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Someday →
                      </Link>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400">🔔 resurfaces {t.revisit_date}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.agenda_items.length > 0 && (
            <section className={sectionClass}>
              <h2 className={headingClass}>Agendas</h2>
              <ul className="space-y-2">
                {results.agenda_items.map((a) => (
                  <li key={a.id} className={rowClass}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm ${a.done ? "line-through opacity-60" : ""}`}>
                        <span className="font-medium">{a.person_name}:</span> {a.note}
                      </span>
                      <Link
                        href="/agendas"
                        className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Agendas →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
