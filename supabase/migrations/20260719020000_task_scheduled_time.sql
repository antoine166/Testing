-- GTD's hard-landscape/soft-landscape line: scheduled_date alone means "the
-- day I plan to work on it" (a soft plan, freely movable). Setting a time
-- alongside it marks the task as a genuine appointment — something that
-- must happen at that specific time, the only thing GTD's Calendar is
-- supposed to hold. Next Actions lists and Someday/Maybe stay untouched by
-- this — this only distinguishes two different reasons a task might carry
-- a scheduled_date.
alter table tasks add column scheduled_time time;
