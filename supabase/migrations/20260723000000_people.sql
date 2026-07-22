-- People layer (SCOPE.md §3.10a): a lightweight person entity so the
-- external brain can answer "everything involving Sarah" — open tasks,
-- delegations, agenda items — in one place. Deliberately NOT a CRM (that
-- was built and removed once already): no interaction logs, no pipeline,
-- just a name to hang existing objects off.
create table people (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz   -- soft delete (Trash, 3.12)
);

create index people_user_id_idx on people(user_id);
create index people_deleted_at_idx on people(deleted_at) where deleted_at is not null;

create trigger people_set_updated_at
  before update on people
  for each row execute function set_updated_at();

alter table people enable row level security;

create policy "owner_select" on people
  for select using (auth.uid() = user_id);
create policy "owner_insert" on people
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on people
  for update using (auth.uid() = user_id);
create policy "owner_delete" on people
  for delete using (auth.uid() = user_id);

-- Tasks link to a person (who it involves / who it's delegated to).
-- set null, not cascade: trashing a person must never eat their tasks.
alter table tasks add column person_id uuid
  references people(id) on delete set null;

create index tasks_person_id_idx on tasks(person_id);

-- Same realtime setup as every other user-facing table.
alter publication supabase_realtime add table people;
alter table people replica identity full;
