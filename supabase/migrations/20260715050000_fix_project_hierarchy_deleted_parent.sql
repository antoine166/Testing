-- enforce_project_hierarchy's parent lookup didn't filter deleted_at is
-- null, so a project could be re-parented under an already-trashed project
-- (inheriting its domain), silently creating a live subproject under a
-- dead parent. The earlier follow-up migration (20260715010000) fixed the
-- analogous gap in the *children* check but missed this one.
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
      from projects
      where id = new.parent_project_id and user_id = new.user_id and deleted_at is null;

    if not found then
      raise exception 'Parent project not found.';
    end if;

    if parent_parent_id is not null then
      raise exception 'Subprojects can only be one level deep.';
    end if;

    select exists(
      select 1 from projects where parent_project_id = new.id and deleted_at is null
    ) into has_children;
    if has_children then
      raise exception 'A project with subprojects cannot itself become a subproject.';
    end if;

    new.domain_id := parent_domain_id;
  end if;

  return new;
end;
$$ language plpgsql;
