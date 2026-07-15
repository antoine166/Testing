-- enforce_project_hierarchy's "can this project become a subproject" check
-- looked at *any* row with parent_project_id = new.id, including trashed
-- ones. Trashing a project's only subproject left the parent permanently
-- unable to become a subproject itself, even though it visibly has zero
-- subprojects everywhere else in the app (which always filters deleted_at
-- is null). Scope the check to live subprojects only.
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
