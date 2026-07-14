-- Image attachments on tasks. Files live in Supabase Storage; this table is
-- just the metadata (filename, content type, and the storage path). Not
-- part of the Trash system — attachments go with their task on purge via
-- the FK below.
--
-- Known limitation: the storage.objects row (and underlying file bytes)
-- are NOT automatically removed when a task is purged via FK cascade —
-- only this metadata row is. Files are only actually deleted from Storage
-- when removed one at a time through the attachment delete API route,
-- which calls the Storage API directly. Cascading that cleanup would need
-- pg_net + an async job, which isn't worth the complexity for a personal
-- app well under the free tier's 1GB storage limit.

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

-- Files are stored at "{user_id}/{task_id}/{filename}" — these policies
-- key off the first path segment matching the requesting user.
create policy "owner_select" on storage.objects
  for select using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner_delete" on storage.objects
  for delete using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- task_attachments
-- ============================================================
create table task_attachments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_id       uuid not null references tasks(id) on delete cascade,
  storage_path  text not null,
  filename      text not null,
  content_type  text,
  size          int,
  created_at    timestamptz not null default now()
);

create index task_attachments_user_id_idx on task_attachments(user_id);
create index task_attachments_task_id_idx on task_attachments(task_id);

alter table task_attachments enable row level security;

create policy "owner_select" on task_attachments
  for select using (auth.uid() = user_id);
create policy "owner_insert" on task_attachments
  for insert with check (auth.uid() = user_id);
create policy "owner_delete" on task_attachments
  for delete using (auth.uid() = user_id);
