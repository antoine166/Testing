-- GTD contexts as a real, standalone list (not just whatever distinct
-- values happen to already be set on tasks.context). tasks.context stays a
-- free-text field — this table only feeds its suggestion dropdown so a
-- context can exist and be selectable before any task uses it, without
-- turning into a full multi-tag system (deliberately out of scope).
create table contexts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index contexts_user_id_idx on contexts(user_id);

alter table contexts enable row level security;

create policy "owner_select" on contexts
  for select using (auth.uid() = user_id);
create policy "owner_insert" on contexts
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on contexts
  for update using (auth.uid() = user_id);
create policy "owner_delete" on contexts
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table contexts;
alter table contexts replica identity full;

-- Seed every existing user with the contexts requested from their old
-- Evernote tag list. on conflict do nothing keeps this safe to re-run and
-- safe for any user who already has a same-named context.
insert into contexts (user_id, name)
select u.id, v.name
from auth.users u
cross join (
  values
    ('0-15 min'), ('15-30 min'), ('30-60 min'), ('60+ min'),
    ('Computer'), ('deep-work'), ('Errands'), ('Gym'),
    ('High Energy'), ('Home'), ('Low Energy'), ('Phone')
) as v(name)
on conflict (user_id, name) do nothing;
