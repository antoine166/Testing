-- Three additions that make the system's *reflect* layer measurable:
--
-- 1. weekly_review_logs — GTD's keystone habit, recorded. The Weekly Review
--    flow logs a row on completion so the app can show a streak, nudge when
--    a review is overdue, and let Analytics answer "is the system actually
--    being maintained" with data.
create table weekly_review_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  -- Snapshot of the numbers at completion time (inbox_count, stalled_count,
  -- topic_shaped_count...) — jsonb so the review flow can evolve what it
  -- records without another migration.
  stats         jsonb
);

create index weekly_review_logs_user_id_idx on weekly_review_logs(user_id);
create index weekly_review_logs_completed_at_idx on weekly_review_logs(completed_at);

alter table weekly_review_logs enable row level security;

create policy "owner_select" on weekly_review_logs
  for select using (auth.uid() = user_id);
create policy "owner_insert" on weekly_review_logs
  for insert with check (auth.uid() = user_id);
create policy "owner_delete" on weekly_review_logs
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table weekly_review_logs;
alter table weekly_review_logs replica identity full;

-- 2. Per-project review cadence (OmniFocus-style). "Every project reviewed
--    every week" stops scaling past ~20 projects; a cadence lets stable
--    projects step back to every 2-4 weeks so the Weekly Review only shows
--    what's actually due. null review_every_days = due at every review
--    (the safe default). last_reviewed_at is stamped by the review flow's
--    "Mark reviewed" action, on any surface (app or MCP).
alter table projects add column review_every_days int
  check (review_every_days is null or review_every_days > 0);
alter table projects add column last_reviewed_at timestamptz;

-- 3. tasks.clarified_at — when the item left the Inbox (domain assigned).
--    Powers the capture→clarify latency metric on Analytics. Set by a
--    trigger rather than app code so every write surface (API routes, MCP,
--    inbound-email webhook, bulk filing) stamps it identically.
alter table tasks add column clarified_at timestamptz;

create or replace function tasks_set_clarified_at()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.domain_id is not null and new.clarified_at is null then
      new.clarified_at = now();
    end if;
  elsif tg_op = 'UPDATE' then
    -- Only the null→domain transition counts as "clarified"; re-filing an
    -- already-processed task keeps its original clarify timestamp.
    if new.domain_id is not null and old.domain_id is null and new.clarified_at is null then
      new.clarified_at = now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tasks_set_clarified_at
  before insert or update on tasks
  for each row execute function tasks_set_clarified_at();

-- Backfill: already-processed tasks get their last-touched time as an
-- approximation (the real clarify moment wasn't recorded). Latency metrics
-- read this as a floor, not gospel — accurate data accrues from now on.
update tasks set clarified_at = coalesce(updated_at, created_at) where domain_id is not null;
