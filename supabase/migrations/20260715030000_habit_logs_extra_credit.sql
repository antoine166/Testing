-- "Extra credit": allow more than one log per habit per day, so doing a
-- habit twice (e.g. two GPP workouts in a day) shows as a bonus square next
-- to the day's original one, instead of being unrepresentable. The 7/day
-- cap is enforced in application code (API route, Coach, MCP), not here.
--
-- For daily/specific_days habits this is purely cosmetic — their streak
-- math (lib/habits/streaks.ts) dedupes logged dates into a Set, so extra
-- same-day logs don't affect streaks. For times_per_week habits, weekly
-- progress/streak math already counts raw log rows (not distinct days),
-- so an extra same-day log intentionally does count toward that week's
-- target — two workouts on Monday count as 2 of a 3x/week goal.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'habit_logs'::regclass
    and contype = 'u'
    and conname like '%user_id%habit_id%logged_date%';
  if cname is not null then
    execute format('alter table habit_logs drop constraint %I', cname);
  end if;
end $$;

create index if not exists habit_logs_habit_date_idx on habit_logs(habit_id, logged_date);
