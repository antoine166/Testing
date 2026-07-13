-- Lets habits be organized by domain, same as tasks/projects. "set null"
-- on domain delete rather than cascading: a habit's trash lifecycle is
-- independent (see 20260709020000_trash_bin.sql), so deleting a domain
-- should un-file its habits, not delete them.
alter table habits add column domain_id uuid references domains(id) on delete set null;

create index habits_domain_id_idx on habits(domain_id);
