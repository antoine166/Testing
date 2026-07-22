-- Project templates (SCOPE.md §3.3a): reusable project shapes for repeating
-- work (client onboarding, program launches). A template captures the
-- project-level fields plus a list of starter tasks; instantiating creates
-- a real project + its tasks in one step.
create table project_templates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  purpose         text,
  outcome_vision  text,
  brainstorm      text,
  link            text,
  domain_id       uuid references domains(id) on delete set null,
  priority        text not null default 'none'
                  check (priority in ('none', 'low', 'medium', 'high')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index project_templates_user_id_idx on project_templates(user_id);

create trigger project_templates_set_updated_at
  before update on project_templates
  for each row execute function set_updated_at();

alter table project_templates enable row level security;

create policy "owner_select" on project_templates
  for select using (auth.uid() = user_id);
create policy "owner_insert" on project_templates
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on project_templates
  for update using (auth.uid() = user_id);
create policy "owner_delete" on project_templates
  for delete using (auth.uid() = user_id);

-- Starter tasks, copied into the new project on instantiate. Deliberately
-- date-free: templates describe shape, not schedule — dates belong to the
-- real project once it exists.
create table project_template_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  template_id  uuid not null references project_templates(id) on delete cascade,
  title        text not null,
  notes        text,
  context      text,
  link         text,
  priority     text not null default 'none'
               check (priority in ('none', 'low', 'medium', 'high')),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index project_template_tasks_template_id_idx
  on project_template_tasks(template_id);

alter table project_template_tasks enable row level security;

create policy "owner_select" on project_template_tasks
  for select using (auth.uid() = user_id);
create policy "owner_insert" on project_template_tasks
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on project_template_tasks
  for update using (auth.uid() = user_id);
create policy "owner_delete" on project_template_tasks
  for delete using (auth.uid() = user_id);

-- Same realtime setup as every other user-facing table, so the Projects
-- page's template list refreshes across tabs like everything else.
alter publication supabase_realtime add table project_templates;
alter table project_templates replica identity full;
alter publication supabase_realtime add table project_template_tasks;
alter table project_template_tasks replica identity full;
