-- Training Log: a catalog of named workouts (editable at any time) plus a
-- per-day log of which ones Antoine did, with optional duration/notes and
-- image attachments. Deliberately separate from Habits — no frequency,
-- streaks, or domain tagging (see SCOPE.md 3.7a).

-- ============================================================
-- workouts (the editable catalog, e.g. "GPP Lift")
-- ============================================================
create table if not exists workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  icon        text,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz   -- soft delete (Trash); logs go with it on purge via FK cascade below
);

create index if not exists workouts_user_id_idx on workouts(user_id);
create index if not exists workouts_deleted_at_idx on workouts(deleted_at) where deleted_at is not null;

alter table workouts enable row level security;

drop policy if exists "owner_select" on workouts;
drop policy if exists "owner_insert" on workouts;
drop policy if exists "owner_update" on workouts;
drop policy if exists "owner_delete" on workouts;
create policy "owner_select" on workouts for select using (auth.uid() = user_id);
create policy "owner_insert" on workouts for insert with check (auth.uid() = user_id);
create policy "owner_update" on workouts for update using (auth.uid() = user_id);
create policy "owner_delete" on workouts for delete using (auth.uid() = user_id);

-- ============================================================
-- workout_logs (one row per workout performed on a given day; more than
-- one row for the same workout+day is allowed, e.g. an AM/PM session)
-- ============================================================
create table if not exists workout_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  workout_id        uuid not null references workouts(id) on delete cascade,
  logged_date       date not null,
  duration_minutes  int,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists workout_logs_user_id_idx on workout_logs(user_id);
create index if not exists workout_logs_workout_id_idx on workout_logs(workout_id);
create index if not exists workout_logs_user_date_idx on workout_logs(user_id, logged_date);

alter table workout_logs enable row level security;

drop policy if exists "owner_select" on workout_logs;
drop policy if exists "owner_insert" on workout_logs;
drop policy if exists "owner_update" on workout_logs;
drop policy if exists "owner_delete" on workout_logs;
create policy "owner_select" on workout_logs for select using (auth.uid() = user_id);
create policy "owner_insert" on workout_logs for insert with check (auth.uid() = user_id);
create policy "owner_update" on workout_logs for update using (auth.uid() = user_id);
create policy "owner_delete" on workout_logs for delete using (auth.uid() = user_id);

-- ============================================================
-- workout_log_attachments (images on a log entry) — same shape and same
-- Storage-cleanup caveat as task_attachments (20260710000000): purging a
-- log removes this metadata row via FK cascade, but not the underlying
-- Storage object; those are only removed one at a time via the delete API.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('workout-log-attachments', 'workout-log-attachments', false)
on conflict (id) do nothing;

-- storage.objects is shared across every bucket, so policy names here have
-- to be unique app-wide, not just per bucket — task_attachments
-- (20260710000000) already claimed the plain "owner_select"/"owner_insert"/
-- "owner_delete" names on this same table.
drop policy if exists "owner_select_workout_log_attachments" on storage.objects;
drop policy if exists "owner_insert_workout_log_attachments" on storage.objects;
drop policy if exists "owner_delete_workout_log_attachments" on storage.objects;

create policy "owner_select_workout_log_attachments" on storage.objects
  for select using (
    bucket_id = 'workout-log-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner_insert_workout_log_attachments" on storage.objects
  for insert with check (
    bucket_id = 'workout-log-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner_delete_workout_log_attachments" on storage.objects
  for delete using (
    bucket_id = 'workout-log-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists workout_log_attachments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workout_log_id  uuid not null references workout_logs(id) on delete cascade,
  storage_path    text not null,
  filename        text not null,
  content_type    text,
  size            int,
  created_at      timestamptz not null default now()
);

create index if not exists workout_log_attachments_user_id_idx on workout_log_attachments(user_id);
create index if not exists workout_log_attachments_log_id_idx on workout_log_attachments(workout_log_id);

alter table workout_log_attachments enable row level security;

drop policy if exists "owner_select" on workout_log_attachments;
drop policy if exists "owner_insert" on workout_log_attachments;
drop policy if exists "owner_delete" on workout_log_attachments;
create policy "owner_select" on workout_log_attachments for select using (auth.uid() = user_id);
create policy "owner_insert" on workout_log_attachments for insert with check (auth.uid() = user_id);
create policy "owner_delete" on workout_log_attachments for delete using (auth.uid() = user_id);

-- ============================================================
-- seed catalog for existing users
-- ============================================================
insert into workouts (user_id, name)
select u.id, w.name
from auth.users u
cross join (
  values ('CNS'), ('Full Breath Cardio'), ('GPP Lift'), ('Nordic 4x4'), ('Speed Session')
) as w(name)
where not exists (select 1 from workouts existing where existing.user_id = u.id);

-- ============================================================
-- Trash: fold workouts into the daily purge job (workout_logs and
-- workout_log_attachments cascade automatically via "on delete cascade")
-- ============================================================
create or replace function purge_trash()
returns void as $$
begin
  delete from domains where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from projects where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from tasks where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from habits where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from routines where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from contacts where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from knowledge_items where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from workouts where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Realtime (same pattern as 20260716000000/20260716020000)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workouts'
  ) then
    alter publication supabase_realtime add table workouts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workout_logs'
  ) then
    alter publication supabase_realtime add table workout_logs;
  end if;
end $$;

alter table workouts replica identity full;
alter table workout_logs replica identity full;
