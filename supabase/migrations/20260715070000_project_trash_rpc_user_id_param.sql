-- trash_project/restore_project/purge_project_now relied on auth.uid(),
-- which only resolves inside a request made with the user's own session
-- token. The MCP connector's tools run against a service-role client with
-- no session (auth.uid() is null there), so its delete_project tool had to
-- manually reimplement this exact cascade instead of calling the RPC —
-- duplicated cascade logic that could drift from the real one over time.
--
-- Adding p_user_id, defaulting to auth.uid(), keeps every existing caller
-- (the app's DELETE /api/projects/[id] route, Coach's delete_project, and
-- the Trash page's restore/purge routes via lib/trash.ts) working exactly
-- as before with zero changes — they all call these RPCs with named
-- parameters and never pass p_user_id, so the default kicks in. Only a
-- service-role caller needs to (and now does) pass it explicitly.
--
-- Explicitly dropping the old single-argument versions first, rather than
-- just CREATE OR REPLACE with an extra parameter, avoids ending up with two
-- overloaded functions of the same name — Postgres would treat
-- trash_project(uuid) and trash_project(uuid, uuid default ...) as
-- distinct overloads, and a call passing only p_project_id would then be
-- ambiguous between "exact 1-arg match" and "2-arg match via default"
-- instead of cleanly resolving to one function.
drop function if exists trash_project(uuid);
drop function if exists restore_project(uuid);
drop function if exists purge_project_now(uuid);

create function trash_project(p_project_id uuid, p_user_id uuid default auth.uid())
returns void as $$
declare
  ts timestamptz := now();
begin
  update projects set deleted_at = ts
    where id = p_project_id and user_id = p_user_id and deleted_at is null;

  update projects set deleted_at = ts
    where parent_project_id = p_project_id and user_id = p_user_id and deleted_at is null;

  update tasks set deleted_at = ts
    where user_id = p_user_id and deleted_at is null
    and (project_id = p_project_id
         or project_id in (select id from projects where parent_project_id = p_project_id and user_id = p_user_id));
end;
$$ language plpgsql;

create function restore_project(p_project_id uuid, p_user_id uuid default auth.uid())
returns void as $$
declare
  old_ts timestamptz;
begin
  select deleted_at into old_ts from projects
    where id = p_project_id and user_id = p_user_id;

  if old_ts is null then
    return;
  end if;

  update projects set deleted_at = null
    where id = p_project_id and user_id = p_user_id;

  update projects set deleted_at = null
    where parent_project_id = p_project_id and user_id = p_user_id and deleted_at = old_ts;

  update tasks set deleted_at = null
    where user_id = p_user_id and deleted_at = old_ts
    and (project_id = p_project_id
         or project_id in (select id from projects where parent_project_id = p_project_id and user_id = p_user_id));
end;
$$ language plpgsql;

create function purge_project_now(p_project_id uuid, p_user_id uuid default auth.uid())
returns void as $$
begin
  delete from tasks
    where user_id = p_user_id
    and (project_id = p_project_id
         or project_id in (select id from projects where parent_project_id = p_project_id and user_id = p_user_id));

  delete from projects where parent_project_id = p_project_id and user_id = p_user_id;
  delete from projects where id = p_project_id and user_id = p_user_id;
end;
$$ language plpgsql;
