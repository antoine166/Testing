-- Checklists: reusable, resettable lists (e.g. a packing list) — distinct
-- from routines (time-of-day scheduled, surfaced on Today) and tasks
-- (one-shot, not meant to be reused). Source of truth for these
-- definitions is SCOPE.md — keep this file and SCOPE.md in sync if either
-- changes.

-- ============================================================
-- checklists
-- ============================================================
create table checklists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index checklists_user_id_idx on checklists(user_id);
create index checklists_deleted_at_idx on checklists(deleted_at) where deleted_at is not null;

alter table checklists enable row level security;

create policy "owner_select" on checklists
  for select using (auth.uid() = user_id);
create policy "owner_insert" on checklists
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on checklists
  for update using (auth.uid() = user_id);
create policy "owner_delete" on checklists
  for delete using (auth.uid() = user_id);

-- ============================================================
-- checklist_items
-- ============================================================
create table checklist_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  checklist_id  uuid not null references checklists(id) on delete cascade,
  title         text not null,
  checked       boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
-- Not independently trashable — goes with its checklist on purge (same
-- pattern as routine_items), via the "on delete cascade" FK above.

create index checklist_items_user_id_idx on checklist_items(user_id);
create index checklist_items_checklist_id_idx on checklist_items(checklist_id);

alter table checklist_items enable row level security;

create policy "owner_select" on checklist_items
  for select using (auth.uid() = user_id);
create policy "owner_insert" on checklist_items
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on checklist_items
  for update using (auth.uid() = user_id);
create policy "owner_delete" on checklist_items
  for delete using (auth.uid() = user_id);
