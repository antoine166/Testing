-- Simplify Waiting For from a free-text "who" field to a plain checkbox —
-- turned out to be more friction than value in the edit form. waiting_since
-- stays, since it still powers the days-outstanding follow-up prompt.
alter table tasks add column waiting_for boolean not null default false;

update tasks set waiting_for = true where waiting_on is not null;

alter table tasks drop column waiting_on;
