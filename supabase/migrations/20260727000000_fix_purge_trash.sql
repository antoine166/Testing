-- Fix the nightly trash purge — it has never successfully run.
--
-- History: 20260709020000_trash_bin.sql defined purge_trash() with a
-- `delete from contacts` line; 20260709040000_drop_crm.sql dropped the
-- contacts table the same day but didn't redefine the function; and
-- 20260720000000_training_log.sql recreated the function from the stale
-- copy, carrying the dead reference forward. A plpgsql function fails as
-- a unit — the missing-table error rolls back the whole call — so the
-- pg_cron job "purge-trash-daily" has errored every night and no trashed
-- row has ever been hard-deleted.
--
-- This version:
--   * drops the dead contacts line;
--   * covers every trashable type in lib/trash.ts TRASH_CONFIG — the old
--     job never purged checklists, tickler_items, or people (keep this
--     list and TRASH_CONFIG in step when a new type becomes trashable);
--   * deletes children before parents (tasks -> projects -> domains) so
--     ordering can never depend on FK modes. Dependent rows without their
--     own deleted_at (habit_logs, routine_items, checklist_items,
--     workout_logs, attachments) follow via "on delete cascade" FKs, and
--     tasks referencing a purged person/project survive via "set null".
--
-- The 30-day window is unchanged. Backlog note: everything trashed since
-- July 9 is still in the trash; rows older than 30 days will be swept on
-- the first run after this migration is applied — that is the intended
-- behavior finally happening, not data loss.

create or replace function purge_trash()
returns void as $$
begin
  delete from tasks where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from projects where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from domains where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from habits where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from routines where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from checklists where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from knowledge_items where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from tickler_items where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from workouts where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from people where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$ language plpgsql security definer set search_path = public;

-- Prove the fix in the same transaction: a run that errors (as every run
-- did until now) aborts the migration instead of shipping another broken
-- function. With nothing older than 30 days this is a no-op data-wise.
select purge_trash();
