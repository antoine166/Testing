-- Phase 1 schema: domains, projects, tasks, habits, habit_logs, daily_checkins.
-- Source of truth for these definitions is SCOPE.md sections 6 and 7 — keep
-- this file and SCOPE.md in sync if either changes.

-- Shared trigger to keep updated_at current on row updates.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- domains
-- ============================================================
create table domains (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#6366f1',
  icon        text,
  created_at  timestamptz not null default now()
);

create index domains_user_id_idx on domains(user_id);

alter table domains enable row level security;

create policy "owner_select" on domains
  for select using (auth.uid() = user_id);
create policy "owner_insert" on domains
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on domains
  for update using (auth.uid() = user_id);
create policy "owner_delete" on domains
  for delete using (auth.uid() = user_id);

-- ============================================================
-- projects
-- ============================================================
create table projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  domain_id    uuid references domains(id) on delete set null,
  name         text not null,
  description  text,
  status       text not null default 'active'
               check (status in ('active', 'someday', 'completed', 'archived')),
  due_date     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index projects_user_id_idx on projects(user_id);
create index projects_domain_id_idx on projects(domain_id);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

alter table projects enable row level security;

create policy "owner_select" on projects
  for select using (auth.uid() = user_id);
create policy "owner_insert" on projects
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on projects
  for update using (auth.uid() = user_id);
create policy "owner_delete" on projects
  for delete using (auth.uid() = user_id);

-- ============================================================
-- tasks
-- ============================================================
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  project_id      uuid references projects(id) on delete set null,
  domain_id       uuid references domains(id) on delete set null,
  title           text not null,
  notes           text,
  status          text not null default 'todo'
                  check (status in ('todo', 'in_progress', 'done')),
  priority        text not null default 'none'
                  check (priority in ('none', 'low', 'medium', 'high')),
  due_date        date,
  scheduled_date  date,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Inbox = domain_id is null (unprocessed, GTD-style). project_id may be
-- null independently — a processed task can be domain-only, no project.

create index tasks_user_id_idx on tasks(user_id);
create index tasks_project_id_idx on tasks(project_id);
create index tasks_domain_id_idx on tasks(domain_id);
create index tasks_scheduled_date_idx on tasks(scheduled_date);

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

alter table tasks enable row level security;

create policy "owner_select" on tasks
  for select using (auth.uid() = user_id);
create policy "owner_insert" on tasks
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on tasks
  for update using (auth.uid() = user_id);
create policy "owner_delete" on tasks
  for delete using (auth.uid() = user_id);

-- ============================================================
-- habits
-- ============================================================
create table habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  color           text not null default '#10b981',
  icon            text,
  frequency       text not null default 'daily'
                  check (frequency in ('daily', 'specific_days', 'times_per_week')),
  frequency_days  int[],
  target_count    int,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index habits_user_id_idx on habits(user_id);

alter table habits enable row level security;

create policy "owner_select" on habits
  for select using (auth.uid() = user_id);
create policy "owner_insert" on habits
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on habits
  for update using (auth.uid() = user_id);
create policy "owner_delete" on habits
  for delete using (auth.uid() = user_id);

-- ============================================================
-- habit_logs
-- ============================================================
create table habit_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  habit_id     uuid not null references habits(id) on delete cascade,
  logged_date  date not null,
  created_at   timestamptz not null default now(),
  unique (user_id, habit_id, logged_date)
);

create index habit_logs_habit_id_idx on habit_logs(habit_id);
create index habit_logs_user_date_idx on habit_logs(user_id, logged_date);

alter table habit_logs enable row level security;

create policy "owner_select" on habit_logs
  for select using (auth.uid() = user_id);
create policy "owner_insert" on habit_logs
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on habit_logs
  for update using (auth.uid() = user_id);
create policy "owner_delete" on habit_logs
  for delete using (auth.uid() = user_id);

-- ============================================================
-- daily_checkins
-- ============================================================
create table daily_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  energy_level  int not null check (energy_level between 1 and 5),
  focus_level   int not null check (focus_level between 1 and 5),
  notes         text,
  created_at    timestamptz not null default now(),
  unique (user_id, date)
);

create index daily_checkins_user_date_idx on daily_checkins(user_id, date);

alter table daily_checkins enable row level security;

create policy "owner_select" on daily_checkins
  for select using (auth.uid() = user_id);
create policy "owner_insert" on daily_checkins
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on daily_checkins
  for update using (auth.uid() = user_id);
create policy "owner_delete" on daily_checkins
  for delete using (auth.uid() = user_id);
