-- OAuth 2.1 + PKCE authorization server for the /api/mcp remote MCP
-- connector, so claude.ai / Claude Desktop can register itself as a client
-- and obtain a token through a normal login-gated flow (see
-- app/api/mcp/{register,authorize,token}/route.ts). Single-user app, so
-- there's no separate "account" concept here beyond the one Supabase Auth
-- user — codes and tokens are stored as SHA-256 hashes so a DB leak alone
-- doesn't yield usable credentials. Accessed exclusively via the
-- service-role admin client; RLS is enabled with no policies to lock out
-- the anon/authenticated roles entirely.

create table mcp_oauth_clients (
  client_id      text primary key,
  redirect_uris  text[] not null,
  client_name    text,
  created_at     timestamptz not null default now()
);

alter table mcp_oauth_clients enable row level security;

create table mcp_oauth_codes (
  code_hash       text primary key,
  client_id       text not null references mcp_oauth_clients(client_id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  redirect_uri    text not null,
  code_challenge  text not null,
  resource        text,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index mcp_oauth_codes_expires_at_idx on mcp_oauth_codes(expires_at);

alter table mcp_oauth_codes enable row level security;

create table mcp_oauth_tokens (
  access_token_hash    text primary key,
  refresh_token_hash   text unique,
  client_id            text not null references mcp_oauth_clients(client_id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  resource             text,
  expires_at           timestamptz not null,
  refresh_expires_at   timestamptz,
  created_at           timestamptz not null default now()
);

create index mcp_oauth_tokens_refresh_token_hash_idx on mcp_oauth_tokens(refresh_token_hash);
create index mcp_oauth_tokens_expires_at_idx on mcp_oauth_tokens(expires_at);

alter table mcp_oauth_tokens enable row level security;
