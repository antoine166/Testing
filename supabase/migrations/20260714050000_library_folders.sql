-- Nested folders for the Library, like folders on a computer — arbitrary
-- depth via a self-referencing parent_id. Deleting a folder cascades to its
-- subfolders, but items inside just become unfiled (folder_id null) rather
-- than being deleted, since knowledge_items have their own Trash lifecycle.
create table knowledge_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  parent_id   uuid references knowledge_folders(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table knowledge_folders enable row level security;

create policy "owner_select" on knowledge_folders
  for select using (auth.uid() = user_id);

create policy "owner_insert" on knowledge_folders
  for insert with check (auth.uid() = user_id);

create policy "owner_update" on knowledge_folders
  for update using (auth.uid() = user_id);

create policy "owner_delete" on knowledge_folders
  for delete using (auth.uid() = user_id);

alter table knowledge_items
  add column folder_id uuid references knowledge_folders(id) on delete set null;
