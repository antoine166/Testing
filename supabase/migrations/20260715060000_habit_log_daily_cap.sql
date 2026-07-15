-- The 7-logs-per-day "extra credit" cap (20260715030000) was enforced as a
-- separate count-then-insert check, duplicated independently in the API
-- route, Coach, and MCP — three copies with drifted error wording, and
-- each one a TOCTOU race (two near-simultaneous requests can both pass the
-- count check before either insert commits). Enforcing it once here, the
-- same way the subproject depth cap is a DB trigger rather than an
-- app-level check, fixes the duplication and the race at once; the
-- application code now just surfaces this trigger's error message instead
-- of pre-checking.
create or replace function enforce_habit_log_daily_cap()
returns trigger as $$
declare
  existing_count int;
begin
  select count(*) into existing_count
    from habit_logs
    where habit_id = new.habit_id and logged_date = new.logged_date;

  if existing_count >= 7 then
    raise exception 'Already logged 7 times that day — that''s the max.';
  end if;

  return new;
end;
$$ language plpgsql;

create trigger habit_logs_daily_cap
  before insert on habit_logs
  for each row execute function enforce_habit_log_daily_cap();
