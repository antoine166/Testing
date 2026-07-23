import Link from "next/link";

// The user guide: the whole app taught as the loop it implements —
// Capture → Clarify → Organize → Reflect → Engage. Static content, no
// client state; every feature links to its actual page so "read about it"
// and "go do it" are one click apart.

const kbd =
  "rounded border border-zinc-300 bg-zinc-100 px-1 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900";

function Section({
  id,
  emoji,
  title,
  children,
}: {
  id: string;
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="mb-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        {emoji} {title}
      </h2>
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

function L({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-blue-600 underline dark:text-blue-400">
      {children}
    </Link>
  );
}

export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="mb-1 text-2xl font-semibold">📘 How to use Life OS</h1>
      <p className="mb-6 text-sm text-zinc-500">
        The whole app in one page. It&apos;s built on David Allen&apos;s Getting Things Done —
        five moves, repeated forever: capture everything, clarify what it means, organize it
        where it belongs, reflect so you trust it, engage on what matters now.
      </p>

      <nav className="mb-8 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">Jump to</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <a href="#idea" className="underline">The big idea</a>
          <a href="#capture" className="underline">1 · Capture</a>
          <a href="#clarify" className="underline">2 · Clarify</a>
          <a href="#organize" className="underline">3 · Organize</a>
          <a href="#reflect" className="underline">4 · Reflect</a>
          <a href="#engage" className="underline">5 · Engage</a>
          <a href="#claude" className="underline">Claude</a>
          <a href="#first15" className="underline">First 15 minutes</a>
          <a href="#shortcuts" className="underline">Shortcuts</a>
        </div>
      </nav>

      <div className="space-y-8">
        <Section id="idea" emoji="🧠" title="The big idea">
          <p>
            Your head is for having ideas, not holding them. Every commitment you&apos;re
            tracking mentally is an open loop burning attention. The deal this app offers:
            put <em>everything</em> in the system, process it regularly, and your mind will
            stop rehearsing it — because it trusts that nothing gets lost. Every feature
            below exists to earn or keep that trust. (The original map is in the sidebar:{" "}
            <a href="/gtd-workflow-map.pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline dark:text-blue-400">
              GTD Workflow Map
            </a>
            .)
          </p>
        </Section>

        <Section id="capture" emoji="📥" title="1 · Capture — get it out of your head">
          <p>
            <strong>Quick Capture</strong> is the core of the whole app: press{" "}
            <kbd className={kbd}>C</kbd> anywhere (or the blue + button), type the thought,
            hit Capture. Title only is enough — deciding what it <em>means</em> comes later,
            and mixing the two is what makes capture feel heavy. There&apos;s a 🎤 mic for
            dictating, and captures made offline queue up and sync when you&apos;re back.
          </p>
          <p>Three more ways in, all landing in the same Inbox:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Email</strong>: forward anything to your capture address — subject
              becomes the title, body the notes.
            </li>
            <li>
              <strong>Chrome extension</strong>: clip the current page (title, URL, selected
              text) without leaving the browser.
            </li>
            <li>
              <strong>Mind Sweep</strong> (on <L href="/inbox">Inbox</L>): ~18 trigger
              prompts that walk your whole life looking for open loops. Run it when your
              head feels full and during the Weekly Review.
            </li>
          </ul>
        </Section>

        <Section id="clarify" emoji="⚡" title="2 · Clarify — decide what it means">
          <p>
            The <L href="/inbox">Inbox</L> holds everything unprocessed (anything without a
            domain). The <strong>⚡ Clarify</strong> button walks it one item at a time
            through the GTD decision tree:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Under 2 minutes?</strong> Do it now — there&apos;s a live timer.
            </li>
            <li>
              <strong>Defer it</strong>: rewrite the title as the very next <em>physical</em>{" "}
              action (&ldquo;Call Dr. Lee&rdquo;, not &ldquo;dentist&rdquo; — the app nudges
              you if a title still reads like a topic), file it to a domain, optionally add
              project, context, priority, dates.
            </li>
            <li>
              <strong>Delegate it</strong>: hand it off and track it in{" "}
              <L href="/waiting-for">Waiting For</L> with who and a follow-up date.
            </li>
            <li>
              <strong>It&apos;s a project</strong> (more than one step): converts it and
              immediately asks for the first next action.
            </li>
            <li>
              <strong>Not actionable?</strong> Trash it, park it in{" "}
              <L href="/someday">Someday/Maybe</L>, tickle it to resurface on a date, or
              file it as reference in the <L href="/library">Library</L>.
            </li>
          </ul>
          <p>
            Two date fields, deliberately separate: <strong>due</strong> is a real deadline
            (a fact); <strong>scheduled</strong> is the day you intend to work on it (a
            plan). Keeping them apart is what keeps your calendar honest.
          </p>
        </Section>

        <Section id="organize" emoji="🗂️" title="3 · Organize — where things live">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Domains</strong> (<L href="/domains">manage</L>) are your Areas of
              Focus — Health, Business, Family. Everything actionable files under one.
            </li>
            <li>
              <strong>Projects</strong> (<L href="/projects">all projects</L>) are any
              outcome needing more than one step; subprojects go one level deep. The 🧭
              button opens guided <strong>Natural Planning</strong> (purpose → vision →
              brainstorm → organize → next actions) — use it to start a project right or
              un-stick a stalled one. Repeating shapes live in project templates.
            </li>
            <li>
              <strong>Contexts</strong> (<L href="/contexts">browse</L>) tag actions by
              what they need — @Phone, @Errands, @Computer — so lists match situations.
            </li>
            <li>
              <strong><L href="/waiting-for">Waiting For</L></strong> tracks what&apos;s out
              with other people; stale items offer one-tap handoff to{" "}
              <L href="/agendas">Agendas</L> (things to raise with a specific person —{" "}
              <L href="/people">People</L> keeps the roster).
            </li>
            <li>
              <strong><L href="/someday">Someday / Tickler</L></strong>: maybes with no
              commitment, plus dated tickler notes that resurface on Today when their day
              arrives.
            </li>
            <li>
              <strong><L href="/library">Library</L></strong> is reference — no action, just
              worth keeping. Notes, articles, quotes, in nested folders, searchable. One
              resurfaces in each daily digest so your second brain talks back.
            </li>
            <li>
              <strong><L href="/checklists">Checklists</L></strong> for reusable lists
              (packing, launch steps) and <strong><L href="/routines">Routines</L></strong>{" "}
              for time-of-day sequences that surface on Today.
            </li>
            <li>
              <strong><L href="/habits">Habits</L></strong> with streaks and the
              &ldquo;don&apos;t break it twice&rdquo; at-risk warning;{" "}
              <strong><L href="/training-log">Training Log</L></strong> for workouts with
              weekly targets.
            </li>
          </ul>
        </Section>

        <Section id="reflect" emoji="🔭" title="4 · Reflect — keep the system trustworthy">
          <p>Three rhythms, three sizes:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Morning</strong>: <L href="/">Today</L> opens with a 10-second
              energy/focus <L href="/checkin">check-in</L> (which also tunes Do Now — see
              below), then habits, appointments, scheduled tasks, and anything the tickler
              resurfaced.
            </li>
            <li>
              <strong>Evening</strong>: the <L href="/shutdown">Shutdown</L> ritual — decide
              every leftover (tomorrow / anytime / someday / done) so nothing silently rots
              into Overdue, log habits you did, empty your head, close the day.
            </li>
            <li>
              <strong>Weekly</strong>: the <L href="/weekly-review">Weekly Review</L>, the
              keystone habit. Get Clear (mind sweep, inbox to zero) → Get Current (calendar,
              next actions, fuzzy titles, Waiting For, stalled projects, project-by-project
              pass) → Get Creative (Someday, Areas of Focus health,{" "}
              <L href="/horizons">Horizons</L>). It keeps a streak — protect it. Stable
              projects can set &ldquo;review every N days&rdquo; so the pass stays short.
            </li>
          </ul>
          <p>
            <L href="/analytics">Analytics</L> keeps score: the System-trust row (how fast
            you clarify, inbox age, stalled projects, review streak) answers whether GTD is
            being practiced or just installed. The <L href="/calendar">Calendar</L> shows
            the hard landscape — appointments, intentions, and deadlines drawn differently
            on purpose, with two-way Google Calendar sync.
          </p>
        </Section>

        <Section id="engage" emoji="🎯" title="5 · Engage — just do (the right) things">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong><L href="/do-now">Do Now</L></strong> is the money view: it filters
              everything actionable by GTD&apos;s three limiting criteria — context, time
              available, energy — and your morning check-in pre-sets the energy filter on
              low days. &ldquo;15 minutes, low energy, at the computer&rdquo; → here&apos;s
              what fits.
            </li>
            <li>
              <strong><L href="/contexts">Contexts</L></strong> shows whole lists per
              context — read your @Errands list <em>before</em> leaving the house.
            </li>
            <li>
              <strong><L href="/upcoming">Upcoming</L></strong>,{" "}
              <strong><L href="/anytime">Anytime</L></strong>, and{" "}
              <strong><L href="/logbook">Logbook</L></strong> are the standard slices:
              dated, undated-but-ready, and done.
            </li>
            <li>
              Priorities exist, but trust the criteria first: context → time → energy, then
              priority breaks the tie. That&apos;s the order the method intends.
            </li>
          </ul>
        </Section>

        <Section id="claude" emoji="🤖" title="Claude — the same system, conversationally">
          <p>
            The MCP connector gives Claude (claude.ai or Claude Desktop) nearly everything
            you can do here: capture, clarify, file, plan, log habits, run the tickler,
            search — ask it to &ldquo;add X to my inbox&rdquo; or &ldquo;what should I focus
            on today?&rdquo;. A daily digest pings you each morning with habits at risk,
            overdue items, follow-ups due, and one resurfaced Library note. It can even walk
            you through a full Weekly Review by voice and log it so the streak counts.
            Deliberately manual-only: deleting a domain, purging trash early, deleting
            Library folders, and account settings.
          </p>
        </Section>

        <Section id="first15" emoji="🚀" title="Your first 15 minutes (or a reset)">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Create 4–6 <L href="/domains">domains</L> — your actual life areas, not
              aspirational ones.
            </li>
            <li>
              Run a <L href="/inbox">Mind Sweep</L>. Don&apos;t organize while sweeping.
            </li>
            <li>⚡ Clarify the pile. Ruthlessly — trash is a decision too.</li>
            <li>
              Check every project has a next action (the review&apos;s stalled list will
              tell you).
            </li>
            <li>
              Book a recurring half hour for the <L href="/weekly-review">Weekly Review</L>.
              This is the one that keeps all the others honest.
            </li>
          </ol>
        </Section>

        <Section id="shortcuts" emoji="⌨️" title="Shortcuts & fast paths">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <kbd className={kbd}>C</kbd> — Quick Capture, from anywhere.{" "}
              <kbd className={kbd}>Esc</kbd> closes any modal.
            </li>
            <li>Sidebar search box — searches everything: tasks, projects, notes, tickler, agendas.</li>
            <li>
              Inbox &ldquo;Select&rdquo; mode — bulk-file several captures to one domain at
              once.
            </li>
            <li>Overdue header on Today — &ldquo;All → today&rdquo; / &ldquo;All → Anytime&rdquo; bulk triage.</li>
            <li>Email anything to your capture address; clip pages with the extension.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
