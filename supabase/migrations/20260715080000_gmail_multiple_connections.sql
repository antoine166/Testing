-- Multiple Gmail accounts can now be connected at once (e.g. personal +
-- work) — a forwarded email could plausibly come from either one, and
-- there was previously no way to tell connections apart or disconnect
-- just one (the old schema allowed exactly one connection per user and
-- didn't even record which Google account it was).
alter table gmail_connections drop constraint if exists gmail_connections_user_id_key;
alter table gmail_connections add column email text;

-- Nullable: existing connections made before this migration won't have an
-- email on file until they're reconnected. The app treats null as
-- "unknown account" rather than requiring an immediate reconnect.
create unique index gmail_connections_user_id_email_idx on gmail_connections(user_id, email);
