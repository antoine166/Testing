-- Subprojects: a project can optionally live inside one other project
-- (project-within-a-project), capped at one level deep — a subproject
-- cannot itself have subprojects. A subproject always shares its parent's
-- domain (enforced below, not just a UI convention) so domain-grouped views
-- (Projects page, Sidebar) never have to reconcile a mismatch.

alter table projects
  add column parent_project_id uuid references projects(id) on delete cascade;

create index projects_parent_project_id_idx on projects(parent_project_id);

-- Enforces: no self-parenting, max depth of 2 (a project whose parent
-- already has a parent can't be re-parented further; a project that
-- already has children can't become a subproject itself), and keeps
-- domain_id in lockstep with the parent's domain_id on insert/reparent.
create or replace function enforce_project_hierarchy()
returns trigger as $$
declare
  parent_parent_id uuid;
  parent_domain_id uuid;
  has_children boolean;
begin
  if new.parent_project_id is not null then
    if new.parent_project_id = new.id then
      raise exception 'A project cannot be its own subproject.';
    end if;

    select parent_project_id, domain_id into parent_parent_id, parent_domain_id
      from projects where id = new.parent_project_id and user_id = new.user_id;

    if not found then
      raise exception 'Parent project not found.';
    end if;

    if parent_parent_id is not null then
      raise exception 'Subprojects can only be one level deep.';
    end if;

    select exists(select 1 from projects where parent_project_id = new.id)
      into has_children;
    if has_children then
      raise exception 'A project with subprojects cannot itself become a subproject.';
    end if;

    new.domain_id := parent_domain_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger projects_hierarchy_guard
  before insert or update of parent_project_id, domain_id on projects
  for each row execute function enforce_project_hierarchy();

-- Keeps subprojects' domain_id following their parent's whenever the
-- parent's own domain changes (subprojects have no children of their own,
-- so this only ever needs to cascade one level).
create or replace function cascade_project_domain()
returns trigger as $$
begin
  if new.parent_project_id is null and new.domain_id is distinct from old.domain_id then
    update projects set domain_id = new.domain_id
      where parent_project_id = new.id and domain_id is distinct from new.domain_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger projects_cascade_domain
  after update of domain_id on projects
  for each row execute function cascade_project_domain();

-- ============================================================
-- Trash cascade: redefine trash_project/restore_project/purge_project_now
-- to also carry a project's subprojects (and the subprojects' tasks) along
-- with it. trash_domain/restore_domain/purge_domain_now already scope by
-- domain_id — subprojects don't carry their own domain_id read for this
-- purpose (they inherit it, but the column IS still populated by the
-- trigger above), so those four are unaffected and don't need redefining.
-- ============================================================

create or replace function trash_project(p_project_id uuid)
returns void as $$
declare
  ts timestamptz := now();
begin
  update projects set deleted_at = ts
    where id = p_project_id and user_id = auth.uid() and deleted_at is null;

  update projects set deleted_at = ts
    where parent_project_id = p_project_id and user_id = auth.uid() and deleted_at is null;

  update tasks set deleted_at = ts
    where user_id = auth.uid() and deleted_at is null
    and (project_id = p_project_id
         or project_id in (select id from projects where parent_project_id = p_project_id and user_id = auth.uid()));
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

  update projects set deleted_at = null
    where parent_project_id = p_project_id and user_id = auth.uid() and deleted_at = old_ts;

  update tasks set deleted_at = null
    where user_id = auth.uid() and deleted_at = old_ts
    and (project_id = p_project_id
         or project_id in (select id from projects where parent_project_id = p_project_id and user_id = auth.uid()));
end;
$$ language plpgsql;

create or replace function purge_project_now(p_project_id uuid)
returns void as $$
begin
  delete from tasks
    where user_id = auth.uid()
    and (project_id = p_project_id
         or project_id in (select id from projects where parent_project_id = p_project_id and user_id = auth.uid()));

  delete from projects where parent_project_id = p_project_id and user_id = auth.uid();
  delete from projects where id = p_project_id and user_id = auth.uid();
end;
$$ language plpgsql;
