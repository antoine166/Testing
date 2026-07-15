-- Prevents a cycle in knowledge_folders' self-referencing parent_id chain
-- (e.g. A's parent = B, B's parent = A). Nothing enforced this before: the
-- existing app route (PUT /api/knowledge-folders/[id]), Coach's
-- update_knowledge_folder tool, and the MCP tool all write parent_id
-- directly with no check. A cycle would infinite-loop the breadcrumb walk
-- in app/(protected)/library/page.tsx ("while (walk) { ... walk =
-- foldersById.get(walk.parent_id) ... }") and hang that tab. Enforced once
-- here, at the DB, rather than duplicating a walk-up check in every caller.
create or replace function enforce_knowledge_folder_no_cycle()
returns trigger as $$
declare
  cursor_id uuid;
  depth int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A folder cannot be its own parent.';
  end if;

  cursor_id := new.parent_id;
  while cursor_id is not null loop
    depth := depth + 1;
    if depth > 1000 then
      raise exception 'Folder hierarchy too deep or corrupted.';
    end if;
    if cursor_id = new.id then
      raise exception 'That would create a cycle in the folder hierarchy.';
    end if;
    select parent_id into cursor_id from knowledge_folders where id = cursor_id;
  end loop;

  return new;
end;
$$ language plpgsql;

create trigger knowledge_folders_no_cycle
  before insert or update of parent_id on knowledge_folders
  for each row execute function enforce_knowledge_folder_no_cycle();
