-- Weekly goal per workout (e.g. "GPP Lift 1x/week", "Full Breath Cardio
-- 4x/week") — adaptable at any time, same idea as habits.target_count for
-- times_per_week habits, but standalone here since workouts have no other
-- frequency modes to unify with (see lib/workouts/weekly.ts).

alter table workouts add column if not exists weekly_target int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workouts_weekly_target_check'
  ) then
    alter table workouts add constraint workouts_weekly_target_check
      check (weekly_target is null or weekly_target > 0);
  end if;
end $$;

-- Seed the defaults you set for the initial catalog. Existing rows only —
-- doesn't touch a same-named workout you already renamed away from these.
update workouts set weekly_target = 1 where name = 'CNS' and weekly_target is null;
update workouts set weekly_target = 4 where name = 'Full Breath Cardio' and weekly_target is null;
update workouts set weekly_target = 1 where name = 'GPP Lift' and weekly_target is null;
update workouts set weekly_target = 2 where name = 'Nordic 4x4' and weekly_target is null;
update workouts set weekly_target = 1 where name = 'Speed Session' and weekly_target is null;
