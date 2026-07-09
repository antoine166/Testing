-- Phase 3 schema: contacts, contact_interactions.
-- Source of truth for these definitions is SCOPE.md sections 6 and 7 — keep
-- this file and SCOPE.md in sync if either changes.

-- ============================================================
-- contacts
-- ============================================================
create table contacts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  email               text,
  phone               text,
  company             text,
  role                text,
  relationship_type   text not null default 'personal'
                      check (relationship_type in ('personal', 'professional', 'mentor', 'client', 'other')),
  notes               text,
  last_contacted_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index contacts_user_id_idx on contacts(user_id);

create trigger contacts_set_updated_at
  before update on contacts
  for each row execute function set_updated_at();

alter table contacts enable row level security;

create policy "owner_select" on contacts
  for select using (auth.uid() = user_id);
create policy "owner_insert" on contacts
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on contacts
  for update using (auth.uid() = user_id);
create policy "owner_delete" on contacts
  for delete using (auth.uid() = user_id);

-- ============================================================
-- contact_interactions
-- ============================================================
create table contact_interactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  contact_id     uuid not null references contacts(id) on delete cascade,
  type           text not null
                 check (type in ('call', 'email', 'meeting', 'message', 'note')),
  notes          text,
  interacted_at  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index contact_interactions_user_id_idx on contact_interactions(user_id);
create index contact_interactions_contact_id_idx on contact_interactions(contact_id);

-- "Last contacted" auto-updates when an interaction is logged (SCOPE.md 3.10).
-- Uses GREATEST so logging a backdated past interaction doesn't regress a
-- contact's last_contacted_at if a more recent one already exists.
create or replace function update_contact_last_contacted()
returns trigger as $$
begin
  update contacts
  set last_contacted_at = greatest(coalesce(last_contacted_at, NEW.interacted_at), NEW.interacted_at)
  where id = NEW.contact_id;
  return NEW;
end;
$$ language plpgsql;

create trigger contact_interactions_update_last_contacted
  after insert on contact_interactions
  for each row execute function update_contact_last_contacted();

alter table contact_interactions enable row level security;

create policy "owner_select" on contact_interactions
  for select using (auth.uid() = user_id);
create policy "owner_insert" on contact_interactions
  for insert with check (auth.uid() = user_id);
create policy "owner_update" on contact_interactions
  for update using (auth.uid() = user_id);
create policy "owner_delete" on contact_interactions
  for delete using (auth.uid() = user_id);
