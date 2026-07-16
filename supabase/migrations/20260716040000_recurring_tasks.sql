-- Recurring tasks: a template describes the recurrence rule; actual task
-- rows are generated ahead of time (bounded by horizon_count) rather than
-- created lazily on completion, so "Upcoming" always shows what's coming
-- without waiting on a prior occurrence to be checked off.
--
-- Generation itself lives in app code (lib/recurring-tasks/), triggered by
-- a token-secured endpoint (/api/recurring-tasks/generate) on the same
-- external-routine pattern as the existing daily digest — not a DB trigger
-- or pg_cron job, to keep the (fairly involved) date-math in one place
-- alongside its tests instead of split across SQL and TypeScript.
create table recurring_task_templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  notes           text,
  link            text,
  domain_id       uuid references domains(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  priority        text not null default 'none'
                  check (priority in ('none', 'low', 'medium', 'high')),

  recurrence_type text not null check (recurrence_type in ('weekly', 'monthly', 'interval')),
  -- weekly: one or more weekdays, 0=Sun..6=Sat (same convention as
  -- habits.frequency_days / JS Date#getDay()).
  days_of_week    int[],
  -- monthly: day of month, 1-31. Clamped to the last day of shorter months
  -- (e.g. 31 in April generates on the 30th).
  day_of_month    int,
  -- interval: every N days, counted from last_generated_date.
  interval_days   int,

  horizon_count   int not null default 12 check (horizon_count > 0 and horizon_count <= 52),
  active          boolean not null default true,
  -- The latest occurrence date already generated (or the template's
  -- created_at date if none yet) — generation resumes counting forward
  -- from here, so re-running it is idempotent instead of scanning tasks.
  last_generated_date date,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint recurring_task_templates_pattern_check check (
    (recurrence_type = 'weekly' and days_of_week is not null and interval_days is null and day_of_month is null) or
    (recurrence_type = 'monthly' and day_of_month is not null and days_of_week is null and interval_days is null) or
    (recurrence_type = 'interval' and interval_days is not null and interval_days > 0 and days_of_week is null and day_of_month is null)
  )
);

create index recurring_task_templates_user_id_idx on recurring_task_templates(user_id);

create trigger recurring_task_templates_set_updated_at
  before update on recurring_task_templates
  for each row execute function set_updated_at();

alter table recurring_task_templates enable row level security;

create policy "owner_select" on recurring_task_templates
  for select using (auth.uid() = user_id);
create policy "owner_insert" on recurring_task_templates
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on recurring_task_templates
  for update using (auth.uid() = user_id);
create policy "owner_delete" on recurring_task_templates
  for delete using (auth.uid() = user_id);

-- Generated occurrences are ordinary tasks, just tagged back to the
-- template that produced them. Deleting the template stops future
-- generation but leaves already-generated tasks alone (set null, not
-- cascade) — they're independent tasks at that point.
alter table tasks add column recurring_template_id uuid
  references recurring_task_templates(id) on delete set null;

create index tasks_recurring_template_id_idx on tasks(recurring_template_id);

-- Same two-part realtime setup as 20260716000000/20260716020000: publication
-- membership so changes broadcast at all, and REPLICA IDENTITY FULL so
-- UPDATE/DELETE events carry the full row (needed for Realtime to evaluate
-- the owner_select RLS policy) instead of just the primary key.
alter publication supabase_realtime add table recurring_task_templates;
alter table recurring_task_templates replica identity full;
