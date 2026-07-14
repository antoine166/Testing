-- Lightweight GTD "Agendas": things to bring up with a specific person next
-- time you talk to them. Deliberately not a contacts/CRM table (that was
-- dropped) — person_name is free text, and items are simple enough not to
-- need trash/soft-delete like tasks/projects do.
create table agenda_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  person_name text not null,
  note        text not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table agenda_items enable row level security;

create policy "owner_select" on agenda_items
  for select using (auth.uid() = user_id);

create policy "owner_insert" on agenda_items
  for insert with check (auth.uid() = user_id);

create policy "owner_update" on agenda_items
  for update using (auth.uid() = user_id);

create policy "owner_delete" on agenda_items
  for delete using (auth.uid() = user_id);
