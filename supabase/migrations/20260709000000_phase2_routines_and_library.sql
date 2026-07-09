-- Phase 2 schema: routines, routine_items, knowledge_items.
-- Source of truth for these definitions is SCOPE.md sections 6 and 7 — keep
-- this file and SCOPE.md in sync if either changes.
--
-- Note: routine_items gets a user_id column not present in the original
-- SCOPE.md draft, so it can use the same direct owner-only RLS pattern as
-- every other table instead of a join-through-routines policy. SCOPE.md
-- has been updated to match.

-- ============================================================
-- routines
-- ============================================================
create table routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  time_of_day  text not null default 'morning'
               check (time_of_day in ('morning', 'afternoon', 'evening', 'custom')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index routines_user_id_idx on routines(user_id);

alter table routines enable row level security;

create policy "owner_select" on routines
  for select using (auth.uid() = user_id);
create policy "owner_insert" on routines
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on routines
  for update using (auth.uid() = user_id);
create policy "owner_delete" on routines
  for delete using (auth.uid() = user_id);

-- ============================================================
-- routine_items
-- ============================================================
create table routine_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  routine_id         uuid not null references routines(id) on delete cascade,
  title              text not null,
  duration_minutes   int,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now()
);

create index routine_items_user_id_idx on routine_items(user_id);
create index routine_items_routine_id_idx on routine_items(routine_id);

alter table routine_items enable row level security;

create policy "owner_select" on routine_items
  for select using (auth.uid() = user_id);
create policy "owner_insert" on routine_items
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on routine_items
  for update using (auth.uid() = user_id);
create policy "owner_delete" on routine_items
  for delete using (auth.uid() = user_id);

-- ============================================================
-- knowledge_items
-- ============================================================
create table knowledge_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  content     text,
  url         text,
  type        text not null default 'note'
              check (type in ('note', 'article', 'book', 'quote', 'resource')),
  tags        text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index knowledge_items_user_id_idx on knowledge_items(user_id);
create index knowledge_items_tags_idx on knowledge_items using gin(tags);

create trigger knowledge_items_set_updated_at
  before update on knowledge_items
  for each row execute function set_updated_at();

alter table knowledge_items enable row level security;

create policy "owner_select" on knowledge_items
  for select using (auth.uid() = user_id);
create policy "owner_insert" on knowledge_items
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on knowledge_items
  for update using (auth.uid() = user_id);
create policy "owner_delete" on knowledge_items
  for delete using (auth.uid() = user_id);
