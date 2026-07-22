-- Two-way Google Calendar sync (SCOPE.md §3.5a).
--
-- Mirrors gmail_connections: one row per connected Google account. Multiple
-- accounts can be connected for *reading* events into the Life OS calendar;
-- time-blocked tasks are *pushed* to exactly one of them (the oldest
-- connection) to keep push semantics unambiguous.
create table google_calendar_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  email         text,
  -- The primary calendar's IANA timezone, captured at connect time — pushed
  -- events need an explicit timeZone and tasks only store local wall time.
  time_zone     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, email)
);

create index google_calendar_connections_user_id_idx
  on google_calendar_connections(user_id);

create trigger google_calendar_connections_set_updated_at
  before update on google_calendar_connections
  for each row execute function set_updated_at();

alter table google_calendar_connections enable row level security;

-- Same owner-only policy set as gmail_connections: rows are only ever
-- touched server-side (connect callback, disconnect route, Settings list),
-- always under the owner's session or the service role.
create policy "owner_select" on google_calendar_connections
  for select using (auth.uid() = user_id);
create policy "owner_insert" on google_calendar_connections
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on google_calendar_connections
  for update using (auth.uid() = user_id);
create policy "owner_delete" on google_calendar_connections
  for delete using (auth.uid() = user_id);

-- Link from a pushed task to its Google Calendar event, so reschedules
-- update the same event instead of duplicating it, and unscheduling/
-- trashing/completing can remove it.
alter table tasks add column gcal_event_id text;
