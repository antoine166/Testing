-- Widens recurring_task_templates with the patterns Things 3's "Repeat"
-- sheet has that this app didn't: an after-completion anchor (next copy N
-- days/weeks/months/years after you finish the current one, instead of a
-- fixed calendar slot), yearly, "2nd Tuesday"-style monthly-by-weekday, a
-- clamp-vs-roll choice for day-of-month overflow, and an explicit end
-- (never / on a date / after N occurrences).
--
-- recurrence_type stays the single discriminator (each value owns its own
-- exclusive set of non-null pattern columns) rather than adding a parallel
-- "anchor_mode" flag — 'completion' is just another pattern kind alongside
-- 'weekly'/'monthly'/etc, so the existing one-column-per-template shape and
-- generation entry point don't fork in two.
alter table recurring_task_templates
  drop constraint recurring_task_templates_pattern_check;

alter table recurring_task_templates
  drop constraint recurring_task_templates_recurrence_type_check;

alter table recurring_task_templates
  add constraint recurring_task_templates_recurrence_type_check
    check (recurrence_type in ('weekly', 'monthly', 'monthly_nth_weekday', 'yearly', 'interval', 'completion'));

-- yearly: month component (day component reuses day_of_month below).
alter table recurring_task_templates
  add column month_of_year int check (month_of_year between 1 and 12);

-- monthly_nth_weekday: "2nd Tuesday" = week_of_month 2, weekday_of_month 2.
-- week_of_month -1 means "last" (handles months with 4 vs 5 of a weekday).
alter table recurring_task_templates
  add column week_of_month int check (week_of_month between -1 and 5 and week_of_month <> 0),
  add column weekday_of_month int check (weekday_of_month between 0 and 6);

-- monthly / yearly: when day_of_month doesn't exist in the target month,
-- 'clamp' generates on the last valid day (current, only, behavior before
-- this migration); 'roll' generates on the 1st of the following month instead.
alter table recurring_task_templates
  add column month_clamp text not null default 'clamp' check (month_clamp in ('clamp', 'roll'));

-- completion: next copy is generated completion_offset_count
-- completion_offset_unit(s) after the prior occurrence is marked done, not
-- on a fixed schedule — so unlike every other recurrence_type, occurrences
-- for this one aren't pre-generated ahead of a horizon; see
-- lib/recurring-tasks/generate.ts and the task-completion route.
alter table recurring_task_templates
  add column completion_offset_count int check (completion_offset_count > 0),
  add column completion_offset_unit text check (completion_offset_unit in ('day', 'week', 'month', 'year'));

-- Ends: never (default, current behavior) / on a specific date / after a
-- fixed number of occurrences. occurrences_generated is a lifetime counter
-- (not a live count of pending tasks, which fluctuates with completion and
-- deletion) so "after N occurrences" means N total, ever.
alter table recurring_task_templates
  add column ends_type text not null default 'never' check (ends_type in ('never', 'date', 'count')),
  add column ends_date date,
  add column ends_count int check (ends_count > 0),
  add column occurrences_generated int not null default 0;

alter table recurring_task_templates
  add constraint recurring_task_templates_ends_check check (
    (ends_type = 'never' and ends_date is null and ends_count is null) or
    (ends_type = 'date' and ends_date is not null and ends_count is null) or
    (ends_type = 'count' and ends_count is not null and ends_date is null)
  );

alter table recurring_task_templates
  add constraint recurring_task_templates_pattern_check check (
    (recurrence_type = 'weekly' and days_of_week is not null
      and day_of_month is null and interval_days is null and month_of_year is null
      and week_of_month is null and weekday_of_month is null
      and completion_offset_count is null and completion_offset_unit is null) or
    (recurrence_type = 'monthly' and day_of_month is not null
      and days_of_week is null and interval_days is null and month_of_year is null
      and week_of_month is null and weekday_of_month is null
      and completion_offset_count is null and completion_offset_unit is null) or
    (recurrence_type = 'monthly_nth_weekday' and week_of_month is not null and weekday_of_month is not null
      and days_of_week is null and day_of_month is null and interval_days is null and month_of_year is null
      and completion_offset_count is null and completion_offset_unit is null) or
    (recurrence_type = 'yearly' and day_of_month is not null and month_of_year is not null
      and days_of_week is null and interval_days is null
      and week_of_month is null and weekday_of_month is null
      and completion_offset_count is null and completion_offset_unit is null) or
    (recurrence_type = 'interval' and interval_days is not null and interval_days > 0
      and days_of_week is null and day_of_month is null and month_of_year is null
      and week_of_month is null and weekday_of_month is null
      and completion_offset_count is null and completion_offset_unit is null) or
    (recurrence_type = 'completion' and completion_offset_count is not null and completion_offset_unit is not null
      and days_of_week is null and day_of_month is null and interval_days is null and month_of_year is null
      and week_of_month is null and weekday_of_month is null)
  );
