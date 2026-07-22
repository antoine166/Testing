-- Project support material (SCOPE.md §3.3, GTD): a Library item can attach
-- to a project, so its reference docs sit one click from the action list.
-- Allen keeps support material *separate from* action lists but *findable
-- from* the project — this is that link. set null (not cascade): trashing
-- a project shouldn't take reference material down with it.
alter table knowledge_items add column project_id uuid
  references projects(id) on delete set null;

create index knowledge_items_project_id_idx on knowledge_items(project_id);
