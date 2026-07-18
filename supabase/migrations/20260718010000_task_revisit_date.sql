-- GTD's tickler file: a Someday/Maybe item can carry a "date-specific
-- trigger" (per the official GTD Workflow Map) so it automatically
-- resurfaces for reconsideration on a given date, rather than just sitting
-- in Someday/Maybe until manually reviewed.
alter table tasks add column revisit_date date;
