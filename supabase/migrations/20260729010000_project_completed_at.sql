-- Completed-project lifecycle: when a project was finished. Stamped by the
-- app/MCP update paths whenever status flips to 'completed', cleared when it
-- flips back — the Logbook sorts and buckets by it.
alter table projects add column completed_at timestamptz;

-- Backfill: projects already completed before this column existed get "now".
-- Imperfect — we don't know when they actually finished — but honest: it
-- marks them completed as-of this migration rather than leaving them undated.
update projects
set completed_at = now()
where status = 'completed' and completed_at is null;
