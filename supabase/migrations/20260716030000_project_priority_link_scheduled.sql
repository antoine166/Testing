-- Bring Projects up to the same fields Tasks already have: priority (for
-- deciding which project to focus on), a related link, and a scheduled
-- date (separate from due_date — "start working on this around X").
alter table projects add column priority text not null default 'none'
  check (priority in ('none', 'low', 'medium', 'high'));
alter table projects add column link text;
alter table projects add column scheduled_date date;
