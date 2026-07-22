# Life OS — Feature Spec & Database Schema

> **Single source of truth.** Read this before touching any code. Update it when requirements change — never let the code drift silently from this document.

---

## 1. Purpose

A personal life operating system for Antoine. One app that handles:
- Frictionless capture of anything (tasks, ideas, notes)
- Projects organized under life domains
- Daily routines
- Habit tracking with streaks
- A knowledge library

Core value: **capture must be frictionless.** If Quick Capture ever gets more complex, flag it before shipping.

---

## 2. Stack

| Layer | Tool |
|---|---|
| Frontend + API | Next.js (App Router) |
| Database + Auth | Supabase (Postgres + Supabase Auth) |
| Hosting | Vercel |
| Styling | Tailwind CSS |
| AI (Phase 2+) | Anthropic API — `claude-sonnet-5` |

---

## 3. Features

### 3.1 Quick Capture
The most important feature. Available from everywhere in the app.

- Floating action button (bottom-right) + keyboard shortcut (`C`)
- Modal with a single required field: **title**
- Optional: notes, due date, domain tag
- On submit → saved as a task with no domain assigned, which makes it an inbox item (see 3.4)
- If a domain is set at capture time, the task is already "processed" and skips the inbox
- Must be dismissible with `Escape`
- **Offline queueing**: if the save request fails with a network error (not a real server rejection — an invalid submission still surfaces its error normally), the capture is stashed in IndexedDB (`lib/offline-queue.ts`) instead of lost, including a photo attachment if one was added. It replays automatically against the real API the moment the browser reports it's back online (or on next app load), oldest first — a network error mid-replay stops the run and leaves the rest queued for later, while a genuine server rejection (4xx/5xx) drops just that one entry rather than retrying forever. A persistent badge (`components/offline-queue-indicator.tsx`, same visual language as the realtime "Synced" pulse) shows how many captures are waiting, so it's never a silent black box. This is Quick-Capture-only — the app has no general offline data access (see 8)

### 3.1a Email Capture
A second frictionless-capture path: forward or send an email, it becomes an inbox task, no app needed.

- Emails sent to a dedicated receiving address are turned into a task: subject → title, body → notes
- No domain assigned (lands in Inbox, same as Quick Capture with no domain set)
- Delivered via a Resend inbound webhook (`POST /api/webhooks/resend-inbound`) — Resend parses the incoming email and calls the webhook; the route verifies the request is genuinely from Resend (svix signature) and that the sender is on the allowlist (`INBOUND_ALLOWED_SENDER`, comma-separated — Antoine forwards from more than one address) before creating anything
- Uses the Supabase service-role key to insert the task, since there's no logged-in session on an inbound webhook
- Image attachments on the forwarded email are pulled in too and attached to the created task (see 3.4); non-image attachments are skipped. A single attachment failing to save doesn't fail the task creation — the task is the important part
- Any email from a non-allowlisted sender is silently dropped (no error surfaced, nothing created)
- **Dedup**: the task stores the email's Message-ID (`tasks.source_message_id`, unique). If Resend redelivers the same webhook, or the same email otherwise lands twice, the second insert hits the unique constraint and is treated as a no-op instead of creating a duplicate task
- Body is captured as plain text only (no rendered HTML view) — tried once, but marketing/newsletter email templates rely on inline CSS for layout that isn't safe to render as-is, and stripping it produced broken-looking output (e.g. background images overlapping text)
- **Gmail auto-link** (optional — everything above works without it): the created task's `link` field is normally filled by regex-parsing the forward body for a URL (preferring one that looks like a Gmail permalink, if any was pasted in), which is a best-effort heuristic since Gmail's own "Forward" doesn't reliably include one. If Antoine has connected a Gmail account (Settings page → `lib/gmail/client.ts`, OAuth via `/api/gmail/connect` → `/api/gmail/callback`), the webhook instead looks the forwarded email up by its RFC822 Message-ID (`rfc822msgid:` search, already captured as `tasks.source_message_id` for dedup) via the Gmail API and builds an authoritative `https://mail.google.com/mail/u/0/#all/<id>` link from the real Gmail-internal message ID — falling back to the regex heuristic if no connection exists or the lookup fails for any reason. Uses the minimal `gmail.metadata` + `userinfo.email` scopes (message existence + ID, and which account was connected — never message content). Requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Google Cloud Console — see `.env.local.example` for setup steps); tokens live in `gmail_connections`, RLS owner-only, never returned to the client — read only by the inbound webhook via the service-role client, or by the connect/callback/disconnect routes via the owner's own session. **Multiple Gmail accounts can be connected at once** (e.g. personal + work) — a forwarded email is checked against every connected account (by `email`) until one finds a match; each is listed and disconnectable independently on the Settings page

### 3.1b Chrome Extension Capture
A third frictionless-capture path, for web content specifically: clip the current page without leaving the browser.

- `chrome-extension/` (see its README for setup): a browser popup that saves the current tab's title, URL, selected text (or, if nothing's selected, the full article text via Mozilla's Readability), and a viewport screenshot as a task, landing in the Inbox exactly like Quick Capture or Email Capture with no domain set — filing it into a project, the Knowledge Library, etc. happens from there, same as any other inbox item
- Not part of the Next.js build — a separate, unpacked (not Chrome Web Store-published) extension living in the same repo, plain HTML/JS, no build step
- Authenticates via a personal access token (`POST /api/clip`, `Authorization: Bearer <EXTENSION_ACCESS_TOKEN>`) rather than the app's session cookie, since an extension page can't read that — same pattern as the digest endpoint (3.11a). The screenshot rides along as a base64 data URL in the same request and is stored as a `task_attachments` row, reusing the existing image-attachment infrastructure (3.4) rather than a new table
- Deliberately Inbox-only, no folder/project picker: capture-first GTD principle wins over Evernote-Clipper-style destination choice at capture time (decided explicitly — see 3.1)

### 3.2 Domains
Top-level buckets for life areas (e.g., Health, Work, Business, Personal, Finance, Learning).

- User creates their own domains
- Each has a name, color, and optional icon
- Projects live inside domains
- Tasks can be tagged to a domain directly (without a project)
- **Custom order** (`domains.sort_order`): drag-and-drop reorder on the Domains page. New domains append at the end; existing ones got a stable initial order matching alphabetical on migration so nothing jumped around. Every place that groups by domain (Sidebar, Tasks, Habits) uses whatever order `GET /api/domains` returns, so this one setting controls ordering everywhere

### 3.3 Projects
A project belongs to one domain and contains tasks.

- Fields: name, description, domain, status, due date
- Statuses: `active` | `someday` | `completed` | `archived`
- Projects view groups by domain
- Completing all tasks in a project does NOT auto-complete the project — Antoine marks it done
- **Subprojects** (`projects.parent_project_id`, self-referencing): a project can optionally live
  inside one other project — "project within a project" (e.g. "Move to Atlanta" → "Packing").
  Capped at **one level deep**: a subproject cannot itself have subprojects, and a project that
  already has subprojects can't become one (enforced by a DB trigger, not just the UI). A
  subproject always shares its parent's domain — there's no independent domain picker for it, and
  the domain follows automatically if the parent's domain changes later. The Projects page and
  Sidebar show subprojects nested directly under their parent; a project's "stalled" check (zero
  open tasks) counts its subprojects' open tasks too, since a parent with an active subproject
  that has a next action isn't actually stalled. Trashing/restoring/purging a project cascades to
  its subprojects and all of their tasks together, the same way domain→project cascade already
  works

### 3.4 Tasks
The atomic unit of work.

- Fields: title, notes, project (optional), domain (optional), priority, due date, scheduled date, someday flag, status
- Statuses: `todo` | `in_progress` | `done`
- Priority: `none` | `low` | `medium` | `high`
- **Inbox** (GTD-style, after David Allen): a task is an inbox item when it has **no domain assigned** — i.e. it hasn't been clarified/processed yet. This is independent of whether it has a project.
- **Processed task**: once a domain is assigned, the task leaves the inbox — even if it never gets a project. This supports GTD-style standalone "next actions" that live under a domain with no project at all.
- **Scheduled date**: the date Antoine plans to work on it (drives the Today view)
- **Someday** (`tasks.someday`, boolean): Things-3-style deferred/backlog flag, set from the task's edit form. Orthogonal to domain filing — a task can be under a domain and still be Someday. A someday task is excluded from Inbox and Anytime so it doesn't clutter either
- Tasks can exist without a project (standalone / domain-only) as long as a domain is set
- **Domain/project cascade** (`lib/hooks/use-domain-project-cascade.ts`): picking a domain narrows the project picker to that domain's projects (clearing the current project if it no longer belongs); picking a project jumps the domain to match it automatically, since a project always belongs to exactly one domain. Shared by every domain+project picker in the app — the task edit form and every task create form
- **Create/edit field parity**: every task create form (Tasks, Inbox, Today) exposes the same field set as the task edit form — domain/project, priority, due/scheduled date+time, waiting-for (+ who + follow-up date), someday (+ revisit date), context, estimated minutes, energy level, image attachment, make recurring — via shared components (`components/waiting-for-fields.tsx`, `components/task-extra-fields.tsx`) so the two don't drift apart. Quick Capture (3.1) is the deliberate exception and stays minimal by design. A recurring task template's create/edit form gets the domain/project cascade too, but not the other edit-only fields (someday, context, estimated minutes, energy level, waiting-for) — `recurring_task_templates` has no columns for them, since those are per-occurrence details, not part of the repeating pattern
- **Image attachments**: any task can have one or more images attached (uploaded manually, or pulled in automatically from a forwarded email's attachments — see 3.1a). Stored in Supabase Storage, viewed via short-lived signed URLs since the bucket is private
- **Bulk filing**: the Inbox section on the Tasks page has a "Select" mode — check multiple unprocessed tasks and assign them all to one domain in a single action, instead of opening each one individually
- **Smart-list views** (Things-3-style, see §4 for the sidebar): `/inbox`, `/upcoming`, `/anytime`, `/someday`, `/logbook` each render a filtered slice of the same `tasks` table — no separate storage, just different queries over the fields above. `/tasks` remains as a full by-domain browse view and also supports `?q=` title search from the sidebar's Quick Find

### 3.5 Today View
Antoine's daily dashboard.

Shows (in order):
1. Daily capacity check-in prompt (if not completed today)
2. Habits due today with one-tap check-off
3. Tasks scheduled for today, sorted by priority
4. Any overdue tasks (past scheduled date, not done)

### 3.6 Daily Capacity Check-in
A 10-second prompt Antoine completes each morning.

- Energy level: 1–5
- Focus level: 1–5
- Optional note
- One entry per day — re-opening it shows today's existing entry for editing
- Data is stored for future Coach/insights use (Phase 2)

### 3.7 Habits & Streaks
Simple habit tracker with streak counting.

- Fields: name, icon, frequency, domain (optional)
- Habits can optionally be filed under a domain, same as tasks — the Habits page groups by domain (color dot + name), with an "unfiled" bucket for habits with no domain. Deleting a domain un-files its habits (`on delete set null`) rather than trashing them — a habit's trash lifecycle stays independent
- **Color comes from the domain**, not a per-habit picker — a habit with no domain shows a neutral gray dot. (`habits.color` still exists in the schema as a legacy/unused column — harmless, not surfaced anywhere.)
- Frequency types:
  - `daily` — every day
  - `specific_days` — fixed days of the week (e.g. Mon/Wed/Fri)
  - `times_per_week` — any N days per week, Antoine's choice which days (e.g. "3x per week")
- Logging: tap a day's square to log/unlog it — one log per habit per day everywhere *except* the case below.
- **Extra credit** (`times_per_week` habits only): once a week's target is hit (e.g. 4/4 Noon Breathwork sessions), the tally row grows an additional box — same green as the rest, no separate styling — for each further session that week, with a "+" alongside to log another. This is the only place multiple logs on the same day are possible (all "extra" sessions are dated today); `daily`/`specific_days` habits and the `times_per_week` day-picker are strictly one log per day, unchanged. The underlying weekly math already counted raw log rows rather than distinct days, so this only needed a UI change, not a data model one — two sessions in one day count as 2 of that week's target/streak. Server-side, a habit can be logged up to 7 times on the same date (`habit_logs_daily_cap` DB trigger, applies uniformly across app/Coach/MCP) — a ceiling for extra credit, not a feature of daily logging
- **Current streak**:
  - `daily` / `specific_days`: consecutive required days logged up to today, missing a required day resets to 0
  - `times_per_week`: consecutive weeks where the log count hit the target; a week that falls short resets to 0 (the current, still-in-progress week doesn't break the streak until it ends)
- **Longest streak**: all-time best run, using the same logic as current streak for that habit's frequency type
- Habits view: list of habits with today's check-off status and streak counts
- **"Don't break it twice"** (James Clear, *Atomic Habits*) — a habit is **at risk** when its most recent required occurrence was missed and today isn't logged yet (`lib/habits/streaks.ts` → `isAtRisk`): one more miss would be two in a row, the point a slip turns into a broken habit. For `times_per_week`, "at risk" is time-aware, not just "under target so far" — it only fires once there are no more spare days left in the week to still hit the target (e.g. 4x/week with 0 done: safe through Wednesday, at risk starting Thursday), so it doesn't false-alarm early in the week. Surfaced three ways: (1) the habit row gets an amber border + a frequency-appropriate warning note + ⚠️ (vs. 🔥 for a healthy active streak), (2) the Today view sorts at-risk habits first and calls out the count, (3) the MCP connector's `list_habits`/`get_today_summary` include an `at_risk` flag so the Coach/Claude digest can prioritize the same way
- **Weekly checkbox row**: each habit row shows a strip of checkboxes sized to its cadence — 7 for `daily`, one per required weekday for `specific_days` (both tied to specific dates within the current Mon–Sun week, individually clickable to log/unlog that day — including past days, not just today), or `target_count` plain progress boxes for `times_per_week` (a fill-level tally, not date-specific, since any day counts)

### 3.7a Training Log
A simple log of named workouts, separate from Habits (no domain tagging, and unlike Habits' `daily`/`specific_days`/`times_per_week` frequency modes, a workout has at most one flavor of goal — weekly count — described below).

- **Catalog** (`workouts`): a flat, user-editable list of workout names (e.g. "GPP Lift", "Nordic 4x4") — add/rename/delete anytime via a "+ New Workout" field, no fixed set
- **Logging**: pick a date (defaults to today) and check off which catalog workouts were done that day — a checklist, not a form. Checking an item creates a log entry; unchecking removes the most recent one for that workout+day
- Each log entry (`workout_logs`) optionally carries a duration (minutes) and notes — both optional, filled in via an expandable section under the checked item, not required to log
- The same workout can be logged more than once on the same day (e.g. an AM/PM session) via a "log another session" affordance, once already checked
- **Weekly goal** (`workouts.weekly_target`, optional int): how many times per week Antoine's aiming to do a given workout — set at creation or edited anytime from the catalog ("adaptable as I progress through my training"), same in spirit as a `times_per_week` habit's `target_count` but kept as a standalone field/calculation (`lib/workouts/weekly.ts`) rather than sharing Habits' frequency machinery, since workouts have no other frequency modes to unify with. Each workout row shows "N/target this week" (Monday-Sunday calendar week, same convention as habits) plus a 🔥 streak of consecutive weeks the goal was hit — the in-progress current week counts once it's already hit target, and doesn't break the streak just for not being over yet. Also has Habits' "don't break it twice" (3.7) at-risk warning: an amber border + ⚠️ + a "Running out of days" note once there are no more spare days left in the week to still hit target, surfaced the same three ways as habits (row styling, and `list_workouts`'s `at_risk` flag for Coach/MCP — no Today view integration for Training Log yet, so no third surface there). Seeded defaults: CNS 1x/week, Full Breath Cardio 4x/week, GPP Lift 1x/week, Nordic 4x4 2x/week, Speed Session 1x/week
- **Image attachments**: a log entry can have one or more images attached, same Storage-backed pattern as task image attachments (3.4) — a private bucket, signed URLs, one metadata row per image
- **History**: the Training Log page lists logged days (most recent first) below the day-picker, filtered to a selectable window — 7/14/28/74/148 days, defaulting to 7 — and the Analytics page (§11 Phase 4) shows workout name + notes + images together under one "Workouts" section
- Deleting a workout from the catalog moves it (and its log entries) to Trash together — recoverable for 30 days, same as everything else in 3.12
- Sidebar entry "Training Log" sits between Habits and Coach (see §4)
- Full Coach + MCP parity: catalog CRUD (including the weekly goal), log/unlog, and a training-history read tool — no app-only exceptions here (image upload is the one MCP/Coach gap, matching task image attachments, which are also app-only for uploads)

### 3.8 Routines *(Phase 2)*
Ordered sequences of steps (tasks, habits, or notes) tied to a time of day.

- Morning / Afternoon / Evening / Custom label
- Steps have a title and optional duration in minutes
- Routines surface in Today view at their scheduled time of day

### 3.8a Checklists *(Phase 4)*
Reusable, resettable lists — for things you run through repeatedly rather than once (e.g. a packing list), distinct from Routines (time-of-day scheduled, surfaced on Today) and Tasks (one-shot).

- A checklist has a name and an ordered list of items
- Checking items off persists until you hit **Reset**, which unchecks every item on that checklist in one action so it's ready to reuse
- Not tied to a time of day and does not surface on the Today view
- Items support reordering (same up/down pattern as Routine steps)

### 3.9 Knowledge Library *(Phase 2)*
A personal second brain for saving things Antoine wants to keep.

- Types: `note` | `article` | `book` | `quote` | `resource`
- Fields: title, content/body, URL (optional), tags, type, optional folder
- Search across all items by keyword or tag
- **Folders** (`knowledge_folders`): nested, arbitrary depth via a self-referencing `parent_id` (like folders on a computer — see §6). A DB trigger (`knowledge_folders_no_cycle`) rejects any insert/update that would make a folder its own ancestor, since the Library page's breadcrumb walks up `parent_id` and would hang on a cycle. Deleting a folder cascades to its subfolders; items inside just become unfiled (`folder_id` null) rather than being deleted

### 3.11 Coach *(Phase 2)*
AI assistant powered by the Anthropic API (`claude-sonnet-5`).

- Has read access to Antoine's domains, projects (including subprojects), tasks, habits, routines,
  checklists, knowledge library folders, and today's check-in
- Antoine can ask it questions: "What should I focus on today?", "How are my habits going?"
- Responds with context-aware coaching, not generic advice
- **Can also take action** via tool use, broadly: create/update/delete tasks and projects
  (including subprojects), create/update domains, log/unlog habits, create/update/delete workouts
  and log/unlog Training Log entries, create/update/delete routines
  and append steps to them, create/update/delete/reset checklists and append items to them, and
  create/organize knowledge library items and folders
- **Every tool call requires Antoine's explicit approve/decline before it runs** — this is the
  safety mechanism, not a restricted tool list. The app shows exactly what's proposed; Coach never
  auto-executes
- Deliberately **not** available to Coach: editing/deleting one existing routine step, checklist
  item, or knowledge library item (Coach's context lists routines/checklists/folders by name+ID so
  it can act on them, but not their individual child items — that granularity is app/MCP-only,
  where a list-then-act tool loop is available). Domain deletion and permanently purging trashed
  items (bypassing the 30-day recovery window) are excluded on both Coach and MCP — kept app-only
  as the two genuinely irreversible actions

### 3.11a Claude Connector (MCP) *(Phase 2)*
A remote MCP server (`/api/mcp`) so Antoine can talk to Claude directly on claude.ai or in the Claude Desktop app — not just the in-app Coach tab — and have it read and manage his Life OS data.

- Registered in claude.ai as a custom connector (Settings → Connectors → Add custom connector), URL `https://<vercel-domain>/api/mcp`
- claude.ai's connector flow requires real OAuth (it auto-registers itself as a client and won't accept a plain shared token), so `/api/mcp` is its own OAuth 2.1 + PKCE authorization server (`/api/mcp/register`, `/api/mcp/authorize`, `/api/mcp/token`, discovery documents at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`) — gated by Antoine's existing Supabase Auth login, not a separate account system
- Authorization codes and tokens are stored as SHA-256 hashes (`mcp_oauth_clients`/`mcp_oauth_codes`/`mcp_oauth_tokens`); access tokens last 1 hour, refresh tokens 6 months with rotation on use
- **Full CRUD across nearly the entire app**, unlike the in-app Coach: tasks and habits
  (create/update/complete/delete, log/unlog), workouts and Training Log entries
  (create/update/delete, log/unlog, plus a training-history read tool), projects and subprojects
  (create/update/delete, cascading to a project's subprojects and their tasks together), domains
  (create/update only — see below), routines and their steps (create/update/delete), checklists
  and their items (create/update/delete/reset), the knowledge library (items: create/update/delete;
  folders: create/update), and the daily check-in (read/write). Plus `get_today_summary` for "what
  should I focus on today" style coaching
- **Deliberately excluded, on both MCP and Coach** — the two genuinely irreversible actions:
  domain deletion (cascades to all of that domain's projects/tasks with no MCP-side confirmation
  step) and permanently purging a trashed item before its 30-day recovery window ends. Both stay
  app-only, where Antoine acts on them directly rather than through a tool call
- Knowledge folder deletion is also excluded (app-only) — unlike knowledge items, folders hard-delete immediately with no trash/recovery step, so it carries the same one-way risk as the two exclusions above
- No app-side "approve before it runs" step exists here the way it does for the in-app Coach — MCP tool calls execute immediately once Claude decides to call them, with only whatever confirmation habits the MCP client itself (claude.ai / Claude Desktop) provides. That's the tradeoff for the broader scope
- **Proactive daily digest**: a scheduled Claude Routine (external to this codebase — configured on the Claude platform, not a Vercel cron) fires daily at 12:00 UTC (8am Eastern, will drift an hour across DST since the cron itself has no timezone) and pushes Antoine a short coaching nudge — habits not yet logged (and which are at-risk, see 3.7), anything overdue, one thing to prioritize. As actually configured, it self-binds to a persistent Claude session (rather than spawning fresh each time) that already has the Life OS MCP connector enabled, and calls `get_today_summary` through it directly. `GET /api/digest` (a plain endpoint gated by a shared secret, `DIGEST_ACCESS_TOKEN`, rather than OAuth — for a curl-based routine that isn't tied to any specific Claude session) still exists in this codebase as the originally-designed alternative, unused by the routine as currently configured. Reconfigured directly on the Claude platform if the time, content, or mechanism needs to change, not in this repo

### 3.12 Trash *(Phase 4)*
Soft delete with a 30-day recovery window, so an accidental delete is never permanent by mistake.

- Applies to: domains, projects, tasks, habits, workouts, routines, knowledge library items
- Deleting one of these sets `deleted_at` instead of removing the row; it disappears from normal views but is recoverable
- Domains and projects cascade: deleting a domain trashes its projects and tasks together (and restoring the domain restores all of them together); deleting a project cascades to its tasks the same way
- Child records that aren't independently trashable (habit logs, routine steps) aren't given their own trash entry — they simply go with their parent when it's permanently purged
- A **Trash** view lists everything pending deletion with days remaining, Restore, and Delete-forever actions
- A scheduled job permanently deletes anything past 30 days — no user action required to empty the trash on schedule

---

## 4. Navigation (Sidebar)

Things-3-inspired: a left sidebar (`components/sidebar-nav.tsx`) instead of a top nav bar, collapsible to a slide-over on mobile. Structure:

```
Life OS
🔍 Quick Find             ← searches task titles, jumps to /tasks?q=
─────────────────────
📥 Inbox        (blue)    ← unprocessed: no domain, not someday, not done
★  Today        (yellow)  ← the daily dashboard (check-in/habits/scheduled/overdue), at "/"
📅 Upcoming     (red)     ← scheduled_date in the future, grouped by date
📚 Anytime      (teal)    ← has a domain, no date, not someday — actionable whenever
📦 Someday      (amber)   ← tasks explicitly marked "Someday" from the task edit form
✓  Logbook      (green)   ← completed tasks, grouped by month
─────────────────────
[Domain color] Domain name         ← one group per domain ("Areas", Things-style)
  Project name                     ← nested, links to /tasks?project=
  Project name
+ New List                         ← links to /domains
─────────────────────
Habits · Training Log · Routines · Checklists · Check-in · Library · Coach · Analytics · Trash · Settings
─────────────────────
user@email · Log out
```

- Only Inbox and Today show a count badge, matching Things
- The Inbox/Upcoming/Anytime/Someday/Logbook views and the `someday` flag are covered in §3.4 (Tasks)
- Quick Capture stays a floating "+" button (`components/quick-capture.tsx`), unaffected by this — frictionless capture doesn't touch navigation
- Domains/Projects, Habits, Routines, Checklists, Library, Coach, Analytics, Check-in, Trash, and Settings all keep their existing internal page designs for now — this redesign covers the navigation shell and the Tasks views, not every page's visual style

---

## 5. Auth

- Supabase Auth — email + password to start
- No social login in Phase 1
- All data is scoped to `user_id` — Row Level Security (RLS) enforced on every table
- Protected routes redirect to `/login` if unauthenticated

---

## 6. Database Schema

All tables have `user_id uuid references auth.users(id)` and RLS policies that restrict every operation to the row owner.

---

### `domains`
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users(id) on delete cascade
name        text not null
color       text not null default '#6366f1'   -- hex color
icon        text                               -- emoji or icon name
created_at  timestamptz default now()
deleted_at  timestamptz   -- soft delete (Trash, 3.12); trashing cascades to its projects/tasks
```

---

### `projects`
```sql
id                 uuid primary key default gen_random_uuid()
user_id            uuid references auth.users(id) on delete cascade
domain_id          uuid references domains(id) on delete set null
parent_project_id  uuid references projects(id) on delete cascade
                   -- self-reference, one level deep only (3.3). Kept in
                   -- sync with the parent's domain_id by a DB trigger —
                   -- always equal to the parent's domain_id when set.
name               text not null
description        text
status             text not null default 'active'
                   -- check: active | someday | completed | archived
due_date           date
created_at         timestamptz default now()
updated_at         timestamptz default now()
deleted_at         timestamptz   -- soft delete (Trash, 3.12); trashing cascades to its
                   -- subprojects and tasks (and its subprojects' tasks)
```

---

### `tasks`
```sql
id              uuid primary key default gen_random_uuid()
user_id         uuid references auth.users(id) on delete cascade
project_id      uuid references projects(id) on delete set null
domain_id       uuid references domains(id) on delete set null
title           text not null
notes           text
status          text not null default 'todo'
                -- check: todo | in_progress | done
priority        text not null default 'none'
                -- check: none | low | medium | high
due_date        date
scheduled_date  date    -- the day Antoine plans to work on it
completed_at    timestamptz
-- inbox = domain_id is null (unprocessed, GTD-style). project_id may be
-- null independently — a processed task can be domain-only, no project.
created_at      timestamptz default now()
updated_at      timestamptz default now()
deleted_at      timestamptz   -- soft delete (Trash, 3.12)
```

---

### `task_attachments` *(Phase 4)*
```sql
id            uuid primary key default gen_random_uuid()
user_id       uuid references auth.users(id) on delete cascade
task_id       uuid references tasks(id) on delete cascade
storage_path  text not null    -- path in the private "task-attachments" Storage bucket
filename      text not null
content_type  text
size          int
created_at    timestamptz default now()
-- not independently trashable — goes with its task on purge. Note: this
-- only removes the metadata row via FK cascade; the underlying Storage
-- object isn't auto-deleted (see 20260710000000_task_attachments.sql).
```

---

### `habits`
```sql
id              uuid primary key default gen_random_uuid()
user_id         uuid references auth.users(id) on delete cascade
name            text not null
color           text not null default '#10b981'
icon            text
frequency       text not null default 'daily'
                -- check: daily | specific_days | times_per_week
frequency_days  int[]   -- 0=Sun … 6=Sat; used when frequency = specific_days
target_count    int     -- e.g. 3; used when frequency = times_per_week
active          boolean not null default true
created_at      timestamptz default now()
deleted_at      timestamptz   -- soft delete (Trash, 3.12); its logs go with it on purge, not independently trashable
```

---

### `habit_logs`
```sql
id           uuid primary key default gen_random_uuid()
user_id      uuid references auth.users(id) on delete cascade
habit_id     uuid references habits(id) on delete cascade
logged_date  date not null
created_at   timestamptz default now()
unique (user_id, habit_id, logged_date)
```

---

### `workouts`
```sql
id             uuid primary key default gen_random_uuid()
user_id        uuid references auth.users(id) on delete cascade
name           text not null
icon           text
weekly_target  int    -- optional goal, times/week; check (weekly_target is null or > 0)
created_at     timestamptz default now()
deleted_at     timestamptz   -- soft delete (Trash, 3.12); its logs go with it on purge (FK cascade)
```

---

### `workout_logs`
```sql
id                uuid primary key default gen_random_uuid()
user_id           uuid references auth.users(id) on delete cascade
workout_id        uuid references workouts(id) on delete cascade
logged_date       date not null
duration_minutes  int
notes             text
created_at        timestamptz default now()
-- no unique constraint: the same workout can be logged more than once on
-- the same day (e.g. an AM/PM session)
```

---

### `workout_log_attachments`
```sql
id              uuid primary key default gen_random_uuid()
user_id         uuid references auth.users(id) on delete cascade
workout_log_id  uuid references workout_logs(id) on delete cascade
storage_path    text not null    -- path in the private "workout-log-attachments" Storage bucket
filename        text not null
content_type    text
size            int
created_at      timestamptz default now()
-- not independently trashable — goes with its log entry on purge, same
-- Storage-cleanup caveat as task_attachments (3.4)
```

---

### `daily_checkins`
```sql
id            uuid primary key default gen_random_uuid()
user_id       uuid references auth.users(id) on delete cascade
date          date not null
energy_level  int not null  -- 1–5
focus_level   int not null  -- 1–5
notes         text
created_at    timestamptz default now()
unique (user_id, date)
```

---

### `routines` *(Phase 2)*
```sql
id           uuid primary key default gen_random_uuid()
user_id      uuid references auth.users(id) on delete cascade
name         text not null
time_of_day  text not null default 'morning'
             -- check: morning | afternoon | evening | custom
active       boolean not null default true
created_at   timestamptz default now()
deleted_at   timestamptz   -- soft delete (Trash, 3.12); its steps go with it on purge, not independently trashable
```

---

### `routine_items` *(Phase 2)*
```sql
id                 uuid primary key default gen_random_uuid()
user_id            uuid references auth.users(id) on delete cascade
routine_id         uuid references routines(id) on delete cascade
title              text not null
duration_minutes   int
sort_order         int not null default 0
created_at         timestamptz default now()
```

---

### `checklists` *(Phase 4)*
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users(id) on delete cascade
name        text not null
created_at  timestamptz default now()
deleted_at  timestamptz   -- soft delete (Trash, 3.12)
```

---

### `checklist_items` *(Phase 4)*
```sql
id            uuid primary key default gen_random_uuid()
user_id       uuid references auth.users(id) on delete cascade
checklist_id  uuid references checklists(id) on delete cascade
title         text not null
checked       boolean not null default false
sort_order    int not null default 0
created_at    timestamptz default now()
-- not independently trashable — goes with its checklist on purge
```

---

### `knowledge_items` *(Phase 2)*
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users(id) on delete cascade
title       text not null
content     text
url         text
type        text not null default 'note'
            -- check: note | article | book | quote | resource
tags        text[]
created_at  timestamptz default now()
updated_at  timestamptz default now()
deleted_at  timestamptz   -- soft delete (Trash, 3.12)
```

---

### `gmail_connections` *(Phase 2)*
```sql
id            uuid primary key default gen_random_uuid()
user_id       uuid references auth.users(id) on delete cascade not null
access_token  text not null
refresh_token text not null
expires_at    timestamptz not null
scope         text
email         text  -- the connected Google account; nullable (connections made
              -- before multi-account support won't have one until reconnected)
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
unique (user_id, email)
-- One row per connected Google account (3.1a Gmail auto-link) — a user can
-- have several. Tokens are never returned to the client — read only by the
-- inbound email webhook (service-role client) or by
-- /api/gmail/{connect,callback,disconnect} (the owner's own session).
```

---

## 7. Row Level Security Policy Pattern

Every table gets these two policies (replace `table_name`):

```sql
-- Enable RLS
alter table table_name enable row level security;

-- Users can only see their own rows
create policy "owner_select" on table_name
  for select using (auth.uid() = user_id);

-- Users can only insert their own rows
create policy "owner_insert" on table_name
  for insert with check (auth.uid() = user_id);

-- Users can only update their own rows
create policy "owner_update" on table_name
  for update using (auth.uid() = user_id);

-- Users can only delete their own rows
create policy "owner_delete" on table_name
  for delete using (auth.uid() = user_id);
```

---

## 8. Key UI Decisions

- **No drag-and-drop in Phase 1** — too complex; manual ordering is fine
- **No notifications in Phase 1** — no push, email, or reminders yet
- **No mobile app** — mobile-responsive web only, but installable as a PWA (`app/manifest.ts`) — "Add to Home Screen" on iOS/iPadOS Safari, "Add to Dock" on macOS Safari 17+, or "Install" on Chrome — for an app-like icon with no browser chrome. On Android, installing also enables the Web Share Target API (`share_target` in the manifest → `/share-capture`) so any app's native Share sheet can send a link/selection straight to the Inbox; iOS Safari doesn't support that API yet
- **No general offline data access** — everything is live from Supabase and auth-gated, so there's no safe way to serve stale data offline. A minimal service worker (`public/sw.js`) only swaps the browser's default "no internet" error for a friendlier branded one (`public/offline.html`) on navigation; it doesn't cache app data. The one deliberate exception is Quick Capture's offline queue (see 3.1) — capture specifically is important enough to work regardless of connection
- **Dark mode** — default; light mode is a future nice-to-have
- **Keyboard shortcut `C`** — opens Quick Capture from anywhere
- **Escape** — closes any modal

---

## 9. Streak Calculation Logic

Streaks are calculated at read time (not stored), based on `habit_logs`. Logic depends on the habit's `frequency`.

**`daily` / `specific_days`:**
```
current_streak:
  Starting from today, count consecutive required days (backwards)
  where a log exists for that habit.
  Stop at the first missing required day.
  If today is a required day with no log yet, start counting from yesterday.

longest_streak:
  Scan all logs for the habit in date order.
  Track the max consecutive-required-day run seen.
```

**`times_per_week`:**
```
current_streak (in weeks):
  Group logs by ISO week.
  Starting from the most recently completed week, walk backwards counting
  weeks where log count >= target_count.
  Stop at the first week that falls short.
  The current, still-in-progress week is excluded from this backward walk —
  it doesn't break the streak until the week is over, and only joins the
  streak once it closes having hit the target.

longest_streak (in weeks):
  Scan all completed weeks in order.
  Track the max consecutive-weeks-at-target run seen.
```

This keeps the DB simple (no streak columns to maintain) and stays correct automatically.

---

## 10. API Route Conventions

All API routes live under `/app/api/`. Pattern:

```
/api/domains          GET, POST
/api/domains/[id]     GET, PUT, DELETE
/api/projects         GET, POST
/api/projects/[id]    GET, PUT, DELETE
/api/tasks            GET, POST
/api/tasks/[id]       GET, PUT, DELETE
/api/habits           GET, POST
/api/habits/[id]      GET, PUT, DELETE
/api/habit-logs       GET, POST, DELETE
/api/checkins         GET, POST, PUT
```

Supabase is called **server-side only** (via the service-role client or the user's session token in Server Components / Route Handlers). Never expose the service-role key to the client.

---

## 11. Phase Roadmap

### Phase 1 — Foundation *(current)*
- [x] Next.js project scaffold (App Router + Tailwind)
- [x] Supabase project + environment variables
- [x] Supabase Auth (email + password, protected routes)
- [x] Database migrations: domains, projects, tasks, habits, habit_logs, daily_checkins
- [x] Domains CRUD
- [x] Projects CRUD (grouped by domain)
- [x] Tasks CRUD (with inbox, scheduling, priority)
- [x] Quick Capture (modal, keyboard shortcut, always accessible)
- [x] Today view (check-in prompt + habits + scheduled tasks + overdue)
- [x] Daily capacity check-in
- [x] Habits list + daily logging
- [x] Streak counter (current + longest)
- [x] Vercel deploy

### Phase 2 — Routines, Library, Coach
- [x] Routines builder + Today view integration (due-today routines with their steps surface on `/`, via `components/today-dashboard.tsx`)
- [x] Knowledge library (CRUD + search + tags, plus nested folders — 3.9)
- [x] Coach (Anthropic API) — now full read/write per 3.11, not read-only as originally scoped; see 3.11 for current tool scope
- [x] Claude Connector (MCP) — remote MCP server for claude.ai / Claude Desktop (3.11a), also expanded to full read/write per 3.11a

### Phase 4 — Polish
- [ ] Supabase Realtime (live updates across tabs) — infra shipped (publication membership, `REPLICA IDENTITY FULL`); a cross-tab bug (edits not propagating) was root-caused to the client never forwarding its JWT to Realtime on `INITIAL_SESSION` and a fix shipped, pending live confirmation
- [x] Mobile UX pass (touch targets, hover-only controls, wrapping fixes audited and fixed); no dedicated live-device QA pass yet
- [x] Habit analytics (`/analytics` — streaks, task completion, check-in trends over a rolling window); weekly review is covered conversationally by Coach's Weekly Review mode (3.11) rather than a separate static view
- [x] Data export (`GET /api/export` — full JSON export of all content types)
- [x] Trash / soft delete with 30-day recovery (3.12)
- [x] Task image attachments (3.4), including from forwarded emails (3.1a)
- [x] Checklists (3.8a)
- [x] Training Log (3.7a) — workout catalog + daily logging with image attachments

---

## 12. Out of Scope (Forever, Unless Decided Otherwise)

- Native mobile apps (iOS / Android)
- Team / shared workspaces — this is a single-user tool
- Third-party calendar sync (Google Calendar, etc.)
- Paid tiers / billing
- Public sharing of any data
