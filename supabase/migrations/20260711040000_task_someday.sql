-- Things-3-style "Someday" list: a task deliberately deferred rather than
-- scheduled or actioned now. Orthogonal to domain/project filing — a task
-- can be filed under a domain and still be someday/maybe.
alter table tasks add column someday boolean not null default false;
