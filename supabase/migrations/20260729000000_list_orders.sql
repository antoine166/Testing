-- Per-page manual ordering (#142): the same task can sit at a different
-- position in different lists (Inbox vs. a project's list), so positions
-- live in their own table keyed by (list_key, item). tasks.sort_order stays
-- as the legacy global order for callers that don't pass a list_key.
--
-- Known list keys: 'inbox', 'anytime', 'project:<project_id>' (shared by
-- the project detail page and the Tasks page's project-filtered view).

create table list_orders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  list_key   text not null,
  item_type  text not null check (item_type in ('task', 'habit')),
  item_id    uuid not null,
  position   int not null,
  unique (user_id, list_key, item_type, item_id)
);

create index list_orders_user_key_idx on list_orders(user_id, list_key);

alter table list_orders enable row level security;

create policy "owner_select" on list_orders
  for select using (auth.uid() = user_id);
create policy "owner_insert" on list_orders
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on list_orders
  for update using (auth.uid() = user_id);
create policy "owner_delete" on list_orders
  for delete using (auth.uid() = user_id);

-- Habits get ONE global manual order (the approved effort-halving cut —
-- not per-page): a plain column, like domains.sort_order. Null = never
-- hand-placed; nulls sort first so new habits surface at the top.
alter table habits add column sort_order int;
