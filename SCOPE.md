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
- A personal CRM

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

- Fields: title, notes, project (optional), domain (optional), priority, due date, scheduled date, status
- Statuses: `todo` | `in_progress` | `done`
- Priority: `none` | `low` | `medium` | `high`
- **Inbox** (GTD-style, after David Allen): a task is an inbox item when it has **no domain assigned** — i.e. it hasn't been clarified/processed yet. This is independent of whether it has a project.
- **Processed task**: once a domain is assigned, the task leaves the inbox — even if it never gets a project. This supports GTD-style standalone "next actions" that live under a domain with no project at all.
- **Scheduled date**: the date Antoine plans to work on it (drives the Today view)
- Tasks can exist without a project (standalone / domain-only) as long as a domain is set

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

- Fields: name, color, icon, frequency
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

### 3.8 Routines *(Phase 2)*
Ordered sequences of steps (tasks, habits, or notes) tied to a time of day.

- Morning / Afternoon / Evening / Custom label
- Steps have a title and optional duration in minutes
- Routines surface in Today view at their scheduled time of day

### 3.9 Knowledge Library *(Phase 2)*
A personal second brain for saving things Antoine wants to keep.

- Types: `note` | `article` | `book` | `quote` | `resource`
- Fields: title, content/body, URL (optional), tags, type
- Search across all items by keyword or tag
- No folders — tags only

### 3.10 Personal CRM *(Phase 3)*
Lightweight relationship manager.

- Contacts: name, email, phone, company, role, relationship type, notes
- Relationship types: `personal` | `professional` | `mentor` | `client` | `other`
- Interaction log per contact: type (call, email, meeting, message, note), notes, date
- "Last contacted" auto-updates when an interaction is logged
- No automations or reminders in Phase 3 — manual logging only

### 3.11 Coach *(Phase 2)*
AI assistant powered by the Anthropic API (`claude-sonnet-5`).

- Has read access to Antoine's tasks, habits, check-ins, and projects
- Antoine can ask it questions: "What should I focus on today?", "How are my habits going?"
- Responds with context-aware coaching, not generic advice
- **Can also take action** via tool use: create tasks and log habits on Antoine's behalf when the conversation implies it (e.g. "remind me to call the dentist" → creates a task; "I did my workout" → logs the habit)
- Allowed write actions for Phase 2: create task, log habit. No edits/deletes, no project or domain creation, no check-in writes — keep the blast radius small until this is proven out
- Exact confirmation UX (auto-create vs. confirm-before-write) is a Phase 2 design decision, not finalized here

---

## 4. Navigation (Sidebar)

```
⚡ Quick Capture         ← always visible / floating button
─────────────────────
📥 Inbox                 ← unprocessed captures
📅 Today                 ← daily dashboard
─────────────────────
🗂  Projects             ← grouped by domain
✅ Tasks                 ← all tasks, filterable
─────────────────────
🔁 Habits
📋 Routines              (Phase 2)
─────────────────────
📚 Library               (Phase 2)
👥 CRM                   (Phase 3)
🤖 Coach                 (Phase 2)
─────────────────────
⚙️  Settings
```

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
```

---

### `contacts` *(Phase 3)*
```sql
id                  uuid primary key default gen_random_uuid()
user_id             uuid references auth.users(id) on delete cascade
name                text not null
email               text
phone               text
company             text
role                text
relationship_type   text not null default 'personal'
                    -- check: personal | professional | mentor | client | other
notes               text
last_contacted_at   timestamptz
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

---

### `contact_interactions` *(Phase 3)*
```sql
id             uuid primary key default gen_random_uuid()
user_id        uuid references auth.users(id) on delete cascade
contact_id     uuid references contacts(id) on delete cascade
type           text not null
               -- check: call | email | meeting | message | note
notes          text
interacted_at  timestamptz not null default now()
created_at     timestamptz default now()
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
- [ ] Today view (check-in prompt + habits + scheduled tasks + overdue)
- [x] Daily capacity check-in
- [x] Habits list + daily logging
- [x] Streak counter (current + longest)
- [x] Vercel deploy

### Phase 2 — Routines, Library, Coach
- [ ] Routines builder + Today view integration
- [ ] Knowledge library (CRUD + search + tags)
- [ ] Coach (Anthropic API, read-only context)

### Phase 3 — CRM
- [ ] Contacts CRUD
- [ ] Interaction log
- [ ] Last-contacted tracking

### Phase 4 — Polish
- [ ] Supabase Realtime (live updates across tabs)
- [ ] Mobile UX pass
- [ ] Habit analytics / weekly review view
- [ ] Data export

---

## 12. Out of Scope (Forever, Unless Decided Otherwise)

- Native mobile apps (iOS / Android)
- Team / shared workspaces — this is a single-user tool
- Third-party calendar sync (Google Calendar, etc.)
- Paid tiers / billing
- Public sharing of any data
