-- Trash bin: soft-delete for the main content types, 30-day recovery window.
-- Source of truth for these definitions is SCOPE.md — keep this file and
-- SCOPE.md in sync if either changes.
--
-- Deleting one of the seven trashable types sets deleted_at instead of
-- removing the row. Normal reads filter deleted_at is null; the trash view
-- shows deleted_at is not null. A daily pg_cron job hard-deletes anything
-- past 30 days — FK "on delete cascade" then takes care of dependent rows
-- (habit_logs, routine_items, contact_interactions) automatically, which is
-- why those child tables don't need their own deleted_at column.
--
-- Deleting a domain or project cascades the trash to its children (tasks,
-- and a project's tasks too) so they come and go together. trash_domain /
-- trash_project stamp the whole batch with one timestamp; restore_domain /
-- restore_project only restore rows that share that exact timestamp, so a
-- child trashed independently beforehand isn't accidentally revived.

alter table domains add column deleted_at timestamptz;
alter table projects add column deleted_at timestamptz;
alter table tasks add column deleted_at timestamptz;
alter table habits add column deleted_at timestamptz;
alter table routines add column deleted_at timestamptz;
alter table contacts add column deleted_at timestamptz;
alter table knowledge_items add column deleted_at timestamptz;

create index domains_deleted_at_idx on domains(deleted_at) where deleted_at is not null;
create index projects_deleted_at_idx on projects(deleted_at) where deleted_at is not null;
create index tasks_deleted_at_idx on tasks(deleted_at) where deleted_at is not null;
create index habits_deleted_at_idx on habits(deleted_at) where deleted_at is not null;
create index routines_deleted_at_idx on routines(deleted_at) where deleted_at is not null;
create index contacts_deleted_at_idx on contacts(deleted_at) where deleted_at is not null;
create index knowledge_items_deleted_at_idx on knowledge_items(deleted_at) where deleted_at is not null;

-- ============================================================
-- domain cascade
-- ============================================================
create or replace function trash_domain(p_domain_id uuid)
returns void as $$
declare
  ts timestamptz := now();
begin
  update domains set deleted_at = ts
    where id = p_domain_id and user_id = auth.uid() and deleted_at is null;

  update projects set deleted_at = ts
    where domain_id = p_domain_id and user_id = auth.uid() and deleted_at is null;

  update tasks set deleted_at = ts
    where user_id = auth.uid() and deleted_at is null
    and (domain_id = p_domain_id
         or project_id in (select id from projects where domain_id = p_domain_id and user_id = auth.uid()));
end;
$$ language plpgsql;

create or replace function restore_domain(p_domain_id uuid)
returns void as $$
declare
  old_ts timestamptz;
begin
  select deleted_at into old_ts from domains
    where id = p_domain_id and user_id = auth.uid();

  if old_ts is null then
    return;
  end if;

  update domains set deleted_at = null
    where id = p_domain_id and user_id = auth.uid();

  update projects set deleted_at = null
    where domain_id = p_domain_id and user_id = auth.uid() and deleted_at = old_ts;

  update tasks set deleted_at = null
    where user_id = auth.uid() and deleted_at = old_ts
    and (domain_id = p_domain_id
         or project_id in (select id from projects where domain_id = p_domain_id and user_id = auth.uid()));
end;
$$ language plpgsql;

-- ============================================================
-- project cascade
-- ============================================================
create or replace function trash_project(p_project_id uuid)
returns void as $$
declare
  ts timestamptz := now();
begin
  update projects set deleted_at = ts
    where id = p_project_id and user_id = auth.uid() and deleted_at is null;

  update tasks set deleted_at = ts
    where project_id = p_project_id and user_id = auth.uid() and deleted_at is null;
end;
$$ language plpgsql;

create or replace function restore_project(p_project_id uuid)
returns void as $$
declare
  old_ts timestamptz;
begin
  select deleted_at into old_ts from projects
    where id = p_project_id and user_id = auth.uid();

  if old_ts is null then
    return;
  end if;

  update projects set deleted_at = null
    where id = p_project_id and user_id = auth.uid();

  update tasks set deleted_at = null
    where project_id = p_project_id and user_id = auth.uid() and deleted_at = old_ts;
end;
$$ language plpgsql;

-- ============================================================
-- purge now (skip the 30-day wait for one item, from the Trash page).
-- Tasks/routine items/etc. under the other five trashable types already
-- cascade-delete via "on delete cascade" FKs, so only domains/projects
-- need dedicated cascade logic here — their tasks use "on delete set
-- null", which would silently orphan them instead of removing them.
-- ============================================================
create or replace function purge_domain_now(p_domain_id uuid)
returns void as $$
begin
  delete from tasks
    where user_id = auth.uid()
    and (domain_id = p_domain_id
         or project_id in (select id from projects where domain_id = p_domain_id and user_id = auth.uid()));

  delete from projects where domain_id = p_domain_id and user_id = auth.uid();
  delete from domains where id = p_domain_id and user_id = auth.uid();
end;
$$ language plpgsql;

create or replace function purge_project_now(p_project_id uuid)
returns void as $$
begin
  delete from tasks where project_id = p_project_id and user_id = auth.uid();
  delete from projects where id = p_project_id and user_id = auth.uid();
end;
$$ language plpgsql;

-- ============================================================
-- scheduled purge — requires the pg_cron extension. Enable it first from
-- the Supabase dashboard: Database -> Extensions -> search "pg_cron" ->
-- Enable (Supabase installs it into pg_catalog; that's expected). Running
-- this migration before enabling the extension will fail on the
-- `create extension` line below. No schema is specified here so this
-- matches wherever the dashboard already put it.
-- ============================================================
create extension if not exists pg_cron;

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
end;
$$ language plpgsql security definer set search_path = public;

select cron.schedule('purge-trash-daily', '0 3 * * *', 'select purge_trash()');
