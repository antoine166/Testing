-- GTD's tickler file (the classic 43-folders idea), for something that
-- isn't a task yet — a bare "show me this again on X date" note, distinct
-- from tasks.revisit_date (which only applies to an already-existing
-- Someday/Maybe task). "Don't think about this until March" with nothing
-- actionable to track in the meantime.
create table tickler_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  note          text not null,
  revisit_date  date not null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index tickler_items_user_id_idx on tickler_items(user_id);
create index tickler_items_deleted_at_idx on tickler_items(deleted_at) where deleted_at is not null;
create index tickler_items_revisit_date_idx on tickler_items(revisit_date);

alter table tickler_items enable row level security;

create policy "owner_select" on tickler_items
  for select using (auth.uid() = user_id);
create policy "owner_insert" on tickler_items
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on tickler_items
  for update using (auth.uid() = user_id);
create policy "owner_delete" on tickler_items
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table tickler_items;
alter table tickler_items replica identity full;
