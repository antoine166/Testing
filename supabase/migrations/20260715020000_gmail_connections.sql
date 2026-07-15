-- Stores a single Google OAuth connection per user, used to look up the
-- Gmail-internal ID of a forwarded email (by its RFC822 Message-ID, already
-- captured in tasks.source_message_id) so the app can build a reliable
-- "open in Gmail" permalink instead of relying on whatever link, if any,
-- happened to be pasted into the forward body (see app/api/webhooks/resend-inbound).
-- Tokens are never read by the client — only server routes with either the
-- owning session (connect/callback/disconnect) or the service-role client
-- (the inbound webhook, which has no session) touch this table.
create table gmail_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id)
);

alter table gmail_connections enable row level security;

create policy "owner_select" on gmail_connections
  for select using (auth.uid() = user_id);

create policy "owner_insert" on gmail_connections
  for insert with check (auth.uid() = user_id);

create policy "owner_update" on gmail_connections
  for update using (auth.uid() = user_id);

create policy "owner_delete" on gmail_connections
  for delete using (auth.uid() = user_id);
