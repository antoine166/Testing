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

### 3.2 Domains
Top-level buckets for life areas (e.g., Health, Work, Business, Personal, Finance, Learning).

- User creates their own domains
- Each has a name, color, and optional icon
- Projects live inside domains
- Tasks can be tagged to a domain directly (without a project)

### 3.3 Projects
A project belongs to one domain and contains tasks.

- Fields: name, description, domain, status, due date
- Statuses: `active` | `someday` | `completed` | `archived`
- Projects view groups by domain
- Completing all tasks in a project does NOT auto-complete the project — Antoine marks it done

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
- Logging: one log per habit per day (tap to toggle on/off)
- **Current streak**:
  - `daily` / `specific_days`: consecutive required days logged up to today, missing a required day resets to 0
  - `times_per_week`: consecutive weeks where the log count hit the target; a week that falls short resets to 0 (the current, still-in-progress week doesn't break the streak until it ends)
- **Longest streak**: all-time best run, using the same logic as current streak for that habit's frequency type
- Habits view: list of habits with today's check-off status and streak counts
- **"Don't break it twice"** (James Clear, *Atomic Habits*) — a habit is **at risk** when its most recent required occurrence was missed and today isn't logged yet (`lib/habits/streaks.ts` → `isAtRisk`): one more miss would be two in a row, the point a slip turns into a broken habit. Surfaced three ways: (1) the habit row gets an amber border + "don't break it twice" note + ⚠️ (vs. 🔥 for a healthy active streak), (2) the Today view sorts at-risk habits first and calls out the count, (3) the MCP connector's `list_habits`/`get_today_summary` include an `at_risk` flag so the Coach/Claude digest can prioritize the same way

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
- Fields: title, content/body, URL (optional), tags, type
- Search across all items by keyword or tag
- No folders — tags only

### 3.11 Coach *(Phase 2)*
AI assistant powered by the Anthropic API (`claude-sonnet-5`).

- Has read access to Antoine's tasks, habits, check-ins, and projects
- Antoine can ask it questions: "What should I focus on today?", "How are my habits going?"
- Responds with context-aware coaching, not generic advice
- **Can also take action** via tool use: create tasks and log habits on Antoine's behalf when the conversation implies it (e.g. "remind me to call the dentist" → creates a task; "I did my workout" → logs the habit)
- Allowed write actions for Phase 2: create task, log habit. No edits/deletes, no project or domain creation, no check-in writes — keep the blast radius small until this is proven out
- Exact confirmation UX (auto-create vs. confirm-before-write) is a Phase 2 design decision, not finalized here

### 3.11a Claude Connector (MCP) *(Phase 2)*
A remote MCP server (`/api/mcp`) so Antoine can talk to Claude directly on claude.ai or in the Claude Desktop app — not just the in-app Coach tab — and have it read and manage his Life OS data.

- Registered in claude.ai as a custom connector (Settings → Connectors → Add custom connector), URL `https://<vercel-domain>/api/mcp`
- claude.ai's connector flow requires real OAuth (it auto-registers itself as a client and won't accept a plain shared token), so `/api/mcp` is its own OAuth 2.1 + PKCE authorization server (`/api/mcp/register`, `/api/mcp/authorize`, `/api/mcp/token`, discovery documents at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`) — gated by Antoine's existing Supabase Auth login, not a separate account system
- Authorization codes and tokens are stored as SHA-256 hashes (`mcp_oauth_clients`/`mcp_oauth_codes`/`mcp_oauth_tokens`); access tokens last 1 hour, refresh tokens 6 months with rotation on use
- Broader tool scope than the in-app Coach: full CRUD on tasks and habits (create/update/complete/delete, log/unlog), read-only on domains/projects, read/write on the daily check-in, plus a `get_today_summary` tool for "what should I focus on today" style coaching
- Domains: full read/create/update (`list_domains`, `create_domain`, `update_domain`) via MCP; delete stays app-only (it cascades to projects/tasks — kept out of MCP's reach deliberately). Habit tools (`create_habit`/`update_habit`) accept an optional `domain_id`. Projects remain read-only (`list_projects`). Routines, checklists, knowledge library, and attachments are not exposed via MCP yet — manage those in the app
- **Proactive daily digest**: a scheduled Claude Routine (external to this codebase — configured on the Claude platform, not a Vercel cron) fires daily at 12:00 UTC (8am Eastern, will drift an hour across DST since the cron itself has no timezone), calls `get_today_summary` over this same connector, and pushes Antoine a short coaching nudge — habits not yet logged, anything overdue, one thing to prioritize. Reconfigured directly on the Claude platform if the time or content needs to change, not in this repo

### 3.12 Trash *(Phase 4)*
Soft delete with a 30-day recovery window, so an accidental delete is never permanent by mistake.

- Applies to: domains, projects, tasks, habits, routines, knowledge library items
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
Habits · Routines · Checklists · Check-in · Library · Coach · Analytics · Trash · Settings
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
id           uuid primary key default gen_random_uuid()
user_id      uuid references auth.users(id) on delete cascade
domain_id    uuid references domains(id) on delete set null
name         text not null
description  text
status       text not null default 'active'
             -- check: active | someday | completed | archived
due_date     date
created_at   timestamptz default now()
updated_at   timestamptz default now()
deleted_at   timestamptz   -- soft delete (Trash, 3.12); trashing cascades to its tasks
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
- **No mobile app** — mobile-responsive web only
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
- [ ] Routines builder + Today view integration
- [ ] Knowledge library (CRUD + search + tags)
- [ ] Coach (Anthropic API, read-only context)
- [ ] Claude Connector (MCP) — remote MCP server for claude.ai / Claude Desktop (3.11a)

### Phase 4 — Polish
- [ ] Supabase Realtime (live updates across tabs)
- [ ] Mobile UX pass
- [ ] Habit analytics / weekly review view
- [ ] Data export
- [ ] Trash / soft delete with 30-day recovery (3.12)
- [ ] Task image attachments (3.4), including from forwarded emails (3.1a)
- [ ] Checklists (3.8a)

---

## 12. Out of Scope (Forever, Unless Decided Otherwise)

- Native mobile apps (iOS / Android)
- Team / shared workspaces — this is a single-user tool
- Third-party calendar sync (Google Calendar, etc.)
- Paid tiers / billing
- Public sharing of any data
