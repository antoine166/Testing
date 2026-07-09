-- Guard against a bad target_count breaking weekly-streak math (a
-- times_per_week habit with target_count <= 0 makes every week "met",
-- inflating the streak without limit). API routes already validate this;
-- this is the DB-level backstop, matching the CHECK pattern already used
-- for the frequency column.
alter table habits add constraint habits_target_count_positive
  check (target_count is null or target_count > 0);
