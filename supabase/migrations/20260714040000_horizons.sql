-- GTD Horizons 3-5 (Goals & Objectives, Vision, Purpose & Principles) — reviewed
-- "as needed" per the methodology, not daily/weekly like tasks, so this is a
-- single free-text row per user rather than a structured list.
create table horizons (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  goals       text,
  vision      text,
  purpose     text,
  updated_at  timestamptz not null default now()
);

alter table horizons enable row level security;

create policy "owner_select" on horizons
  for select using (auth.uid() = user_id);

create policy "owner_insert" on horizons
  for insert with check (auth.uid() = user_id);

create policy "owner_update" on horizons
  for update using (auth.uid() = user_id);
